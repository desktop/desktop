import { cp, mkdtemp, rm } from 'fs/promises'
import { AddressInfo } from 'net'
import { tmpdir } from 'os'
import { join } from 'path'
import { createProxyProcessServer } from 'process-proxy'
import type { IGitExecutionOptions } from '../git/core'
import { getRepoHooks } from './get-repo-hooks'
import { createHooksProxy } from './hooks-proxy'
import { getShellEnv } from './get-shell-env'
import memoizeOne from 'memoize-one'
import {
  getCacheHooksEnv,
  getGitHookEnvShell,
  getHooksEnvEnabled,
  SupportedHooksEnvShell,
} from './config'

const memoizedGetShellEnv = memoizeOne(
  async (shellKind: SupportedHooksEnvShell, cwd: string, cacheKey: string) => {
    const shellEnvStartTime = Date.now()
    const shellEnv = await getShellEnv(cwd, shellKind)
    log.debug(
      `hooks: loaded shell environment in ${Date.now() - shellEnvStartTime}ms`
    )
    return shellEnv
  }
)

export async function withHooksEnv<T>(
  fn: (env: Record<string, string | undefined> | undefined) => Promise<T>,
  path: string,
  opts: IGitExecutionOptions | undefined
): Promise<T> {
  if (!opts?.interceptHooks) {
    return fn(opts?.env)
  }

  const hooks = await Array.fromAsync(getRepoHooks(path, opts.interceptHooks))

  if (hooks.length === 0) {
    return fn(opts?.env)
  }

  const ext = __WIN32__ ? '.exe' : ''
  const processProxyPath = join(__dirname, `process-proxy${ext}`)

  const token = crypto.randomUUID()
  const tmpHooksDir = await mkdtemp(join(tmpdir(), 'desktop-git-hooks-'))
  // Intercept hooks for progress and failure reporting even when the user has
  // not opted into loading a shell environment.
  const hooksPathConfig = `'core.hooksPath=${tmpHooksDir}'`
  const hooksProxy = createHooksProxy(
    getHooksEnvEnabled()
      ? cwd =>
          memoizedGetShellEnv(
            getGitHookEnvShell(),
            cwd,
            // Cache per operation unless cross-operation caching is enabled.
            getCacheHooksEnv() ? 'global' : token
          )
      : undefined,
    tmpHooksDir,
    hooksPathConfig,
    opts?.onHookProgress,
    opts?.onHookFailure
  )

  const server = createProxyProcessServer(
    conn =>
      hooksProxy(conn).catch(err => {
        log.error(`hooks proxy failed:`, err)
        conn.exit(1).catch(() => {})
      }),
    { validateConnection: async receivedToken => receivedToken === token }
  )
  const port = await new Promise<number>(resolve => {
    server.listen(0, '127.0.0.1', () =>
      resolve((server.address() as AddressInfo).port)
    )
  })
  try {
    for (const hook of hooks) {
      await cp(processProxyPath, join(tmpHooksDir, `${hook}${ext}`))
    }

    const existingGitEnvConfig =
      opts?.env?.['GIT_CONFIG_PARAMETERS'] ??
      process.env['GIT_CONFIG_PARAMETERS'] ??
      ''

    const gitEnvConfigPrefix =
      existingGitEnvConfig.length > 0 ? `${existingGitEnvConfig} ` : ''

    return await fn({
      // TODO: Do we need to escape tmpHooksDir? Could it possibly include a single quote?
      // probably not?
      GIT_CONFIG_PARAMETERS: `${gitEnvConfigPrefix}${hooksPathConfig}`,
      PROCESS_PROXY_PORT: `${port}`,
      PROCESS_PROXY_TOKEN: token,
    })
  } finally {
    server.close()
    // Clean up the temporary directory
    await rm(tmpHooksDir, { recursive: true, force: true }).catch(() => {
      // Ignore errors
    })
  }
}
