import { git, IGitStringExecutionOptions } from './core'
import { Repository } from '../../models/repository'
import { Branch, BranchType } from '../../models/branch'
import { ICheckoutProgress } from '../../models/progress'
import {
  CheckoutProgressParser,
  executionOptionsWithProgress,
} from '../progress'
import { AuthenticationErrors } from './authentication'
import { enableRecurseSubmodulesFlag } from '../feature-flag'
import {
  envForRemoteOperation,
  getFallbackUrlForProxyResolve,
} from './environment'
import { WorkingDirectoryFileChange } from '../../models/status'
import { ManualConflictResolution } from '../../models/manual-conflict-resolution'
import { CommitOneLine, shortenSHA } from '../../models/commit'
import { IRemote } from '../../models/remote'

export type ProgressCallback = (progress: ICheckoutProgress) => void

function getCheckoutArgs(progressCallback?: ProgressCallback) {
  return ['checkout', ...(progressCallback ? ['--progress'] : [])]
}

async function getBranchCheckoutArgs(branch: Branch) {
  return [
    branch.name,
    ...(branch.type === BranchType.Remote
      ? ['-b', branch.nameWithoutRemote]
      : []),
    ...(enableRecurseSubmodulesFlag() ? ['--recurse-submodules'] : []),
    '--',
  ]
}

async function getCheckoutOpts(
  repository: Repository,
  title: string,
  target: string,
  currentRemote: IRemote | null,
  progressCallback?: ProgressCallback,
  initialDescription?: string
): Promise<IGitStringExecutionOptions> {
  const opts: IGitStringExecutionOptions = {
    env: await envForRemoteOperation(
      getFallbackUrlForProxyResolve(repository, currentRemote)
    ),
    expectedErrors: AuthenticationErrors,
  }

  if (!progressCallback) {
    return opts
  }

  const kind = 'checkout'

  // Initial progress
  progressCallback({
    kind,
    title,
    description: initialDescription ?? title,
    value: 0,
    target,
  })

  return await executionOptionsWithProgress(
    { ...opts, trackLFSProgress: true },
    new CheckoutProgressParser(),
    progress => {
      if (progress.kind === 'progress') {
        const description = progress.details.text
        const value = progress.percent

        progressCallback({
          kind,
          title,
          description,
          value,
          target,
        })
      }
    }
  )
}

/**
 * Check out the given branch.
 *
 * @param repository - The repository in which the branch checkout should
 *                     take place
 *
 * @param branch     - The branch name that should be checked out
 *
 * @param progressCallback - An optional function which will be invoked
 *                           with information about the current progress
 *                           of the checkout operation. When provided this
 *                           enables the '--progress' command line flag for
 *                           'git checkout'.
 */
export async function checkoutBranch(
  repository: Repository,
  branch: Branch,
  currentRemote: IRemote | null,
  progressCallback?: ProgressCallback
): Promise<true> {
  const opts = await getCheckoutOpts(
    repository,
    `Checking out branch ${branch.name}`,
    branch.name,
    currentRemote,
    progressCallback,
    `Switching to ${__DARWIN__ ? 'Branch' : 'branch'}`
  )

  const baseArgs = getCheckoutArgs(progressCallback)
  const args = [...baseArgs, ...(await getBranchCheckoutArgs(branch))]

  await git(args, repository.path, 'checkoutBranch', opts)

  // we return `true` here so `GitStore.performFailableGitOperation`
  // will return _something_ differentiable from `undefined` if this succeeds
  return true
}

/**
 * Check out the given commit.
 * Literally invokes `git checkout <commit SHA>`.
 *
 * @param repository - The repository in which the branch checkout should
 *                     take place
 *
 * @param commit     - The commit that should be checked out
 *
 * @param progressCallback - An optional function which will be invoked
 *                           with information about the current progress
 *                           of the checkout operation. When provided this
 *                           enables the '--progress' command line flag for
 *                           'git checkout'.
 */
export async function checkoutCommit(
  repository: Repository,
  commit: CommitOneLine,
  currentRemote: IRemote | null,
  progressCallback?: ProgressCallback
): Promise<true> {
  const title = `Checking out ${__DARWIN__ ? 'Commit' : 'commit'}`
  const opts = await getCheckoutOpts(
    repository,
    title,
    shortenSHA(commit.sha),
    currentRemote,
    progressCallback
  )

  const baseArgs = getCheckoutArgs(progressCallback)
  const args = [...baseArgs, commit.sha]

  await git(args, repository.path, 'checkoutCommit', opts)

  // we return `true` here so `GitStore.performFailableGitOperation`
  // will return _something_ differentiable from `undefined` if this succeeds
  return true
}

/** Check out the paths at HEAD. */
export async function checkoutPaths(
  repository: Repository,
  paths: ReadonlyArray<string>
): Promise<void> {
  await git(
    ['checkout', 'HEAD', '--', ...paths],
    repository.path,
    'checkoutPaths'
  )
}

/**
 * Check out either stage #2 (ours) or #3 (theirs) for a conflicted
 * file.
 */
export async function checkoutConflictedFile(
  repository: Repository,
  file: WorkingDirectoryFileChange,
  resolution: ManualConflictResolution
) {
  await git(
    ['checkout', `--${resolution}`, '--', file.path],
    repository.path,
    'checkoutConflictedFile'
  )
}
