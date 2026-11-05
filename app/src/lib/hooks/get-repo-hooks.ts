import { exec } from 'dugite'
import { access, constants, readdir } from 'fs/promises'
import { basename, join, resolve } from 'path'

const isExecutable = (path: string) =>
  access(path, constants.X_OK)
    .then(() => true)
    .catch(() => false)

const knownHooks = [
  'applypatch-msg',
  'pre-applypatch',
  'post-applypatch',
  'pre-commit',
  'pre-merge-commit',
  'prepare-commit-msg',
  'commit-msg',
  'post-commit',
  'pre-rebase',
  'post-checkout',
  'post-merge',
  'pre-push',
  'pre-receive',
  'update',
  'proc-receive',
  'post-receive',
  'post-update',
  'reference-transaction',
  'push-to-checkout',
  'pre-auto-gc',
  'post-rewrite',
  'sendemail-validate',
  'fsmonitor-watchman',
  'p4-changelist',
  'p4-prepare-changelist',
  'p4-post-changelist',
  'p4-pre-submit',
  'post-index-change',
]

// getRepoHooks is used by withHooksEnv which is used by git in core.ts so we
// have to be careful to not accidentally run into a circular dependency here
// where we invoke git which calls us which calls git which calls us, etc. To
// avoid that we call dugite directly here.
const git = (
  args: string[],
  path: string,
  env?: Record<string, string | undefined>
) =>
  exec(args, path, { env }).then(({ exitCode, stdout, stderr }) => {
    return exitCode === 0
      ? stdout
      : Promise.reject(
          new Error(`Git command failed with exit code ${exitCode}: ${stderr}`)
        )
  })

const getHooksPath = async (
  path: string,
  env?: Record<string, string | undefined>
) =>
  resolve(
    path,
    (await git(['rev-parse', '--git-path', 'hooks'], path, env)).replace(
      /\r?\n$/,
      ''
    )
  )

const getConfigValue = (
  path: string,
  key: string,
  env?: Record<string, string | undefined>
) => git(['config', '-z', '--get', key], path, env).then(x => x.split('\0')[0])

/**
 * Returns the names of executable Git hooks found in the given repository.
 *
 * @param path   The file system path to the Git repository (root of working
 *               directory).
 * @param filter An optional array of hook names to filter the results.
 *               Including '*' will return all hooks.
 * @param env    The same Git environment as the operation being intercepted.
 */
export async function* getRepoHooks(
  path: string,
  filter?: string[],
  env?: Record<string, string | undefined>
) {
  const hooksPath = await getConfigValue(path, 'core.hooksPath', env)
    .catch(() => getHooksPath(path, env))
    .then(p => resolve(path, p))

  const files = await readdir(hooksPath, { withFileTypes: true })
    .then(entries => entries.filter(x => x.isFile()))
    .catch(() => [])

  const matchAll = filter?.includes('*')

  for (const file of files) {
    const hookName = basename(file.name, '.exe')

    if (matchAll || filter?.includes(hookName) === false) {
      continue
    }

    if (!knownHooks.includes(hookName)) {
      continue
    }

    if (__WIN32__) {
      // On Windows we have to assume that any valid hook name is executable
      // because the executable bit is not used there. Git looks for a shebang
      // but that seems expensive to check here :shrug:
      yield hookName
    } else if (await isExecutable(join(file.parentPath, file.name))) {
      yield hookName
    }
  }
}
