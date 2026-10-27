import { git, IGitStringExecutionOptions } from './core'
import { ICloneProgress } from '../../models/progress'
import { CloneOptions } from '../../models/clone-options'
import { CloneProgressParser, executionOptionsWithProgress } from '../progress'
import { getDefaultBranch } from '../helpers/default-branch'
import { envForRemoteOperation } from './environment'
import { homedir } from 'os'
import * as Path from 'path'
import { unescape as decodeFilePath } from 'querystring'
import { Repository } from '../../models/repository'
import { getRepositoryType } from './rev-parse'
import { listWorktrees } from './worktree'
import {
  canonicalMutationPath,
  getAssistedCommitProtectedPaths,
  withoutRepositoryGitAccess,
  withRepositoryGitOperation,
  withRepositoryGitResourceMutation,
} from './repository-operation'

const unsupportedCloneProtocols: ReadonlyArray<string> = ['ext', 'ext.exe']

function getLocalCloneSourcePath(url: string): string | null {
  if (url.startsWith('file://')) {
    const start = url.indexOf('/', 'file://'.length)
    if (start === -1) {
      return null
    }
    // Git ignores file URL authorities and decodes paths without stripping # or ?.
    const path = decodeFilePath(url.slice(start))
    return __WIN32__ && /^\/[a-z]:/i.test(path) ? path.slice(1) : path
  }
  const colon = url.indexOf(':')
  const slash = url.indexOf('/')
  if (
    colon !== -1 &&
    (slash === -1 || colon < slash) &&
    !(__WIN32__ && /^[a-z]:/i.test(url))
  ) {
    return null
  }
  return Path.resolve(__dirname, url)
}

async function withLocalCloneSourceRead(
  path: string,
  operation: () => Promise<void>,
  tryGitSuffix = true
): Promise<void> {
  return withRepositoryGitOperation(path, 'read', async () => {
    const type = await getRepositoryType(path)
    if (type.kind === 'missing' && tryGitSuffix) {
      // Git also accepts a repository name with its trailing .git omitted.
      return withLocalCloneSourceRead(`${path}.git`, operation, false)
    }
    if (type.kind !== 'regular' && type.kind !== 'bare') {
      return operation()
    }
    const resources = await getAssistedCommitProtectedPaths(path)
    const worktrees = await listWorktrees(new Repository(path, -1, null, false))
    const paths = [
      ...new Set(
        await Promise.all(
          [...resources, ...worktrees.map(worktree => worktree.path)].map(
            canonicalMutationPath
          )
        )
      ),
    ]
    // Peer worktrees publish into the same refs and object store that clone reads.
    const read = (index: number): Promise<void> =>
      index === paths.length
        ? operation()
        : withRepositoryGitOperation(paths[index], 'read', () =>
            read(index + 1)
          )
    return read(0)
  })
}

/**
 * Check whether a resolved clone path targets a sensitive location that
 * should never be used as a clone destination. This is a backstop against
 * path traversal attacks where a crafted URL tricks the UI into deriving
 * a clone path outside the intended base directory.
 */
function isClonePathSensitive(unresolvedClonePath: string): boolean {
  const clonePath = Path.resolve(unresolvedClonePath).toLowerCase()
  const home = Path.resolve(homedir()).toLowerCase()

  if (clonePath === home) {
    return true
  }

  const sensitiveLocations = [
    Path.join(home, '.ssh'),
    Path.join(home, '.gnupg'),
    Path.join(home, '.config'),
    Path.join(home, '.config', 'git'),
    Path.join(home, '.gitconfig'),
  ]

  if (__WIN32__) {
    const appData = process.env.APPDATA
    if (appData) {
      sensitiveLocations.push(appData.toLowerCase())
      sensitiveLocations.push(Path.join(appData, 'gnupg').toLowerCase())
    }
  }

  for (const sensitive of sensitiveLocations) {
    if (clonePath === sensitive || clonePath.startsWith(sensitive + Path.sep)) {
      return true
    }
  }

  return false
}

/**
 * Clones a repository from a given url into to the specified path.
 *
 * @param url     - The remote repository URL to clone from
 *
 * @param path    - The destination path for the cloned repository. If the
 *                  path does not exist it will be created. Cloning into an
 *                  existing directory is only allowed if the directory is
 *                  empty.
 *
 * @param options  - Options specific to the clone operation, see the
 *                   documentation for CloneOptions for more details.
 *
 * @param progressCallback - An optional function which will be invoked
 *                           with information about the current progress
 *                           of the clone operation. When provided this enables
 *                           the '--progress' command line flag for
 *                           'git clone'.
 */
export async function clone(
  url: string,
  path: string,
  options: CloneOptions,
  progressCallback?: (progress: ICloneProgress) => void
): Promise<void> {
  const unsupportedProtocol = unsupportedCloneProtocols.find(protocol =>
    url.startsWith(`${protocol}::`)
  )
  if (unsupportedProtocol !== undefined) {
    throw new Error(
      `The "${unsupportedProtocol}" transport is not supported for cloning in ${__APP_NAME__}.`
    )
  }

  if (isClonePathSensitive(path)) {
    throw new Error(
      `The clone destination "${path}" targets a sensitive system location. ` +
        'Cloning into this directory is not allowed.'
    )
  }

  const operationPath = Path.resolve(__dirname, path)
  return withRepositoryGitResourceMutation([operationPath], async () => {
    const destination = await canonicalMutationPath(operationPath)
    return withRepositoryGitResourceMutation([destination], () => {
      const source = getLocalCloneSourcePath(url)
      const operation = () => cloneCore(url, path, options, progressCallback)
      return source === null
        ? operation()
        : withLocalCloneSourceRead(source, operation)
    })
  })
}

async function cloneCore(
  url: string,
  path: string,
  options: CloneOptions,
  progressCallback?: (progress: ICloneProgress) => void
): Promise<void> {
  const env = {
    ...(await envForRemoteOperation(url)),
    GIT_CLONE_PROTECTION_ACTIVE: 'false',
    // Git's environment allowlist takes precedence over protocol configuration.
    GIT_ALLOW_PROTOCOL: process.env.GIT_ALLOW_PROTOCOL?.split(':')
      .filter(protocol => !unsupportedCloneProtocols.includes(protocol))
      .join(':'),
  }

  const defaultBranch = options.defaultBranch ?? (await getDefaultBranch())

  const args = [
    '-c',
    `init.defaultBranch=${defaultBranch}`,
    // Apply the same policy after Git expands configured URL rewrites.
    ...unsupportedCloneProtocols.flatMap(protocol => [
      '-c',
      `protocol.${protocol}.allow=never`,
    ]),
    'clone',
    '--recursive',
  ]

  let opts: IGitStringExecutionOptions = { env }

  if (progressCallback) {
    args.push('--progress')

    const title = `Cloning into ${path}`
    const kind = 'clone'

    opts = await executionOptionsWithProgress(
      { ...opts, trackLFSProgress: true },
      new CloneProgressParser(),
      progress => {
        const description =
          progress.kind === 'progress' ? progress.details.text : progress.text
        const value = progress.percent

        withoutRepositoryGitAccess(() =>
          progressCallback({ kind, title, description, value })
        )
      }
    )

    // Initial progress
    withoutRepositoryGitAccess(() =>
      progressCallback({ kind, title, value: 0 })
    )
  }

  if (options.branch) {
    args.push('-b', options.branch)
  }

  args.push('--', url, path)

  await git(args, __dirname, 'clone', opts)
}
