import { spawn } from 'child_process'
import { basename, resolve } from 'path'
import { ProcessProxyConnection as Connection } from 'process-proxy'
import type { HookCallbackOptions } from '../git'
import { resolveGitBinary } from 'dugite'
import { ShellEnvResult } from './get-shell-env'
import { shellFriendlyNames } from './config'
import { Writable } from 'stream'

const ignoredOnFailureHooks = [
  'post-applypatch',
  'post-commit',
  // The exit code from post-checkout doesn't stop the checkout but it does set
  // the overall command's exit code. I don't believe we want to show an error
  // to the user if this hook fails though.
  'post-checkout',
  'post-merge',
  // Again, the exit code here does affect Git in so far that it won't run
  // git-gc but it's not something we should alert the user about.
  'pre-auto-gc',
  'post-rewrite',
]

const excludedEnvVars: ReadonlySet<string> = new Set([
  // Dugite sets these, we don't want to leak them into the hook environment
  'GIT_SYSTEM_CONFIG',
  'GIT_EXEC_PATH',
  'GIT_TEMPLATE_DIR',
  // We set this to point to a custom hooks path which we don't want
  // leaking into the hook's environment. Initially I thought we would have
  // to sanitize this to strip out the custom config we set and leave any
  // user-configured but since we're executing the hook in a separate
  // shell with login it would just get re-initialized there anyway.
  'GIT_CONFIG_PARAMETERS',

  'GIT_ASKPASS',
  'GIT_SSH_COMMAND',
  'GIT_USER_AGENT',
])

const debug = (message: string, error?: Error) => {
  log.debug(`hooks: ${message}`, error)
}

const writeline = (stream: Writable, msg: string) =>
  new Promise<void>((resolve, reject) => {
    stream.write(`${msg}\n`, err => (err ? reject(err) : resolve()))
  })

const tryExit = async (conn: Connection, exitCode = 0) =>
  conn.exit(exitCode).catch(err => {
    debug(
      `failed to exit proxy: ${
        err instanceof Error ? err.message : String(err)
      }`
    )
  })

const exitWithMessage = (conn: Connection, msg: string, exitCode = 0) =>
  writeline(conn.stderr, msg)
    .catch(() => {})
    .then(() => tryExit(conn, exitCode))

const exitWithError = (conn: Connection, msg: string, exitCode = 1) =>
  exitWithMessage(conn, msg, exitCode)

export const createHooksProxy = (
  getShellEnv: (cwd: string) => Promise<ShellEnvResult>,
  onHookProgress?: HookCallbackOptions['onHookProgress'],
  onHookFailure?: HookCallbackOptions['onHookFailure']
) => {
  return async (conn: Connection) => {
    const startTime = Date.now()
    const proxyArgs = await conn.getArgs()
    const proxyEnv = await conn.getEnv()
    const proxyCwd = await conn.getCwd()
    const hasStdin = await conn.isStdinConnected()

    const hookName = basename(proxyArgs[0], __WIN32__ ? '.exe' : undefined)

    const abortController = new AbortController()
    const abort = () => abortController.abort()

    await writeline(conn.stderr, `Running ${hookName} hook...`)
    onHookProgress?.({ hookName, status: 'started', abort })

    // GIT_ vars are considered safe to pass to hooks unless explicitly excluded
    // GITHEAD_ are set by git-merge (https://github.com/git/git/blob/83a69f19359e6d9bc980563caca38b2b5729808c/builtin/merge.c#L1590)
    const safePrefixes = ['GIT_', 'GITHEAD_']

    const safeEnv = Object.fromEntries(
      Object.entries(proxyEnv).filter(
        ([k]) =>
          safePrefixes.some(prefix => k.startsWith(prefix)) &&
          !excludedEnvVars.has(k)
      )
    )

    if (abortController.signal.aborted) {
      debug(`${hookName}: aborted before execution`)
      await exitWithError(conn, `hook ${hookName} aborted`)
      return
    }

    const args = [
      ...['hook', 'run', hookName],
      // We always copy our pre-auto-gc hook in order to be able to tell the
      // user that the reason their commit is taking so long is because Git is
      // performing garbage collection, but it's unlikely that the user has a
      // pre-auto-gc hook configured themselves, so we tell Git to ignore
      // missing hooks here.
      ...(hookName === 'pre-auto-gc' ? ['--ignore-missing'] : []),
      ...(hasStdin ? ['--to-stdin=/dev/stdin'] : []),
      '--',
      ...proxyArgs.slice(1),
    ]

    const terminalOutput: Buffer[] = []
    const gitPath = resolveGitBinary(resolve(__dirname, 'git'))
    const shellEnv = await getShellEnv(proxyCwd)

    if (shellEnv.kind === 'failure') {
      let errMsg = `Failed to load shell environment for hook ${hookName}.`
      debug(errMsg)

      if (shellEnv.shellKind) {
        const friendlyName = shellFriendlyNames[shellEnv.shellKind]
        if (shellEnv.shellKind === 'git-bash') {
          errMsg += `\n${friendlyName} not found. Please ensure Git for Windows is installed and added to your PATH.`
        } else {
          errMsg += `\n${friendlyName} not found. Please ensure it's installed and added to your PATH.`
        }
      }

      errMsg += '\n\nConfigure the shell to use in Preferences > Git > Hooks.'

      return exitWithError(conn, errMsg)
    }

    const { code, signal } = await new Promise<{
      code: number | null
      signal: NodeJS.Signals | null
    }>((resolve, reject) => {
      conn.on('close', abort)

      const child = spawn(gitPath, args, {
        cwd: proxyCwd,
        // GITHUB_DESKTOP lets hooks know they're run from GitHub Desktop.
        // See https://github.com/desktop/desktop/issues/19001
        env: { ...shellEnv.env, ...safeEnv, GITHUB_DESKTOP: '1' },
        signal: abortController.signal,
      })
        .on('close', (code, signal) => resolve({ code, signal }))
        .on('error', err => reject(err))

      // git-hook run takes care of ensuring we only get hook output on stderr
      // https://github.com/git/git/blob/4cf919bd7b946477798af5414a371b23fd68bf93/hook.c#L73C6-L73C22
      child.stderr.pipe(conn.stderr, { end: false }).on('error', reject)
      child.stderr.on('data', data => terminalOutput.push(data))
      conn.stdin.pipe(child.stdin).on('error', reject)
    })

    const dur = `after ${((Date.now() - startTime) / 1000).toFixed(2)}s`
    const prefix = `${hookName} hook`
    const terminationMessage = signal
      ? `${prefix} killed by signal ${signal} ${dur}`
      : `${prefix} ${code ? `failed with code ${code}` : 'done'} ${dur}`

    debug(terminationMessage)

    // If we were to write this to the proxy's stderr it wouldn't make it into the terminalOutput
    // array in time for us to call onHookFailure with it, so we append it here to ensure it's
    // included and then we'll write it to stderr to be included in the overall output later
    const hookFailureTerminalOutput = terminalOutput.concat(
      Buffer.from(`${terminationMessage}\n`)
    )

    const ignoreError =
      code !== null &&
      code !== 0 &&
      !ignoredOnFailureHooks.includes(hookName) &&
      onHookFailure
        ? (await onHookFailure(hookName, hookFailureTerminalOutput)) ===
          'ignore'
        : false

    if (ignoreError) {
      debug(`ignoring error from hook ${hookName} as per onHookFailure result`)
    }

    await writeline(conn.stderr, terminationMessage)

    if (ignoreError) {
      await writeline(conn.stderr, `${hookName} hook failure ignored by user`)
    }

    const exitCode = ignoreError ? 0 : code ?? 1

    await tryExit(conn, exitCode)

    onHookProgress?.({
      hookName,
      status: exitCode === 0 ? 'finished' : 'failed',
    })
  }
}
