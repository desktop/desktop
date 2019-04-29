import {
  GitProcess,
  IGitResult as DugiteResult,
  GitError as DugiteError,
  IGitExecutionOptions as DugiteExecutionOptions,
} from 'dugite'

import { assertNever } from '../fatal-error'
import { getDotComAPIEndpoint } from '../api'
import { enableGitProtocolVersionTwo } from '../feature-flag'

import { IGitAccount } from '../../models/git-account'

import * as GitPerf from '../../ui/lib/git-perf'
import { Repository } from '../../models/repository'
import { getConfigValue, getGlobalConfigValue } from './config'

/**
 * An extension of the execution options in dugite that
 * allows us to piggy-back our own configuration options in the
 * same object.
 */
export interface IGitExecutionOptions extends DugiteExecutionOptions {
  /**
   * The exit codes which indicate success to the
   * caller. Unexpected exit codes will be logged and an
   * error thrown. Defaults to 0 if undefined.
   */
  readonly successExitCodes?: ReadonlySet<number>

  /**
   * The git errors which are expected by the caller. Unexpected errors will
   * be logged and an error thrown.
   */
  readonly expectedErrors?: ReadonlySet<DugiteError>

  /** Should it track & report LFS progress? */
  readonly trackLFSProgress?: boolean
}

/**
 * The result of using `git`. This wraps dugite's results to provide
 * the parsed error if one occurs.
 */
export interface IGitResult extends DugiteResult {
  /**
   * The parsed git error. This will be null when the exit code is included in
   * the `successExitCodes`, or when dugite was unable to parse the
   * error.
   */
  readonly gitError: DugiteError | null

  /** The human-readable error description, based on `gitError`. */
  readonly gitErrorDescription: string | null
}

function getResultMessage(result: IGitResult) {
  const description = result.gitErrorDescription
  if (description) {
    return description
  }

  if (result.stderr.length) {
    return result.stderr
  } else if (result.stdout.length) {
    return result.stdout
  } else {
    return 'Unknown error'
  }
}

export class GitError extends Error {
  /** The result from the failed command. */
  public readonly result: IGitResult

  /** The args for the failed command. */
  public readonly args: ReadonlyArray<string>

  public constructor(result: IGitResult, args: ReadonlyArray<string>) {
    super(getResultMessage(result))

    this.name = 'GitError'
    this.result = result
    this.args = args
  }
}

/**
 * Shell out to git with the given arguments, at the given path.
 *
 * @param args             The arguments to pass to `git`.
 *
 * @param path             The working directory path for the execution of the
 *                         command.
 *
 * @param name             The name for the command based on its caller's
 *                         context. This will be used for performance
 *                         measurements and debugging.
 *
 * @param options          Configuration options for the execution of git,
 *                         see IGitExecutionOptions for more information.
 *
 * Returns the result. If the command exits with a code not in
 * `successExitCodes` or an error not in `expectedErrors`, a `GitError` will be
 * thrown.
 */
export async function git(
  args: string[],
  path: string,
  name: string,
  options?: IGitExecutionOptions
): Promise<IGitResult> {
  const defaultOptions: IGitExecutionOptions = {
    successExitCodes: new Set([0]),
    expectedErrors: new Set(),
  }

  const opts = { ...defaultOptions, ...options }

  const commandName = `${name}: git ${args.join(' ')}`

  const result = await GitPerf.measure(commandName, () =>
    GitProcess.exec(args, path, options)
  )

  const exitCode = result.exitCode

  let gitError: DugiteError | null = null
  const acceptableExitCode = opts.successExitCodes
    ? opts.successExitCodes.has(exitCode)
    : false
  if (!acceptableExitCode) {
    gitError = GitProcess.parseError(result.stderr)
    if (!gitError) {
      gitError = GitProcess.parseError(result.stdout)
    }
  }

  const gitErrorDescription = gitError ? getDescriptionForError(gitError) : null
  const gitResult = { ...result, gitError, gitErrorDescription }

  let acceptableError = true
  if (gitError && opts.expectedErrors) {
    acceptableError = opts.expectedErrors.has(gitError)
  }

  if ((gitError && acceptableError) || acceptableExitCode) {
    return gitResult
  }

  // The caller should either handle this error, or expect that exit code.
  const errorMessage = new Array<string>()
  errorMessage.push(
    `\`git ${args.join(' ')}\` exited with an unexpected code: ${exitCode}.`
  )

  if (result.stdout) {
    errorMessage.push('stdout:')
    errorMessage.push(result.stdout)
  }

  if (result.stderr) {
    errorMessage.push('stderr:')
    errorMessage.push(result.stderr)
  }

  if (gitError) {
    errorMessage.push(
      `(The error was parsed as ${gitError}: ${gitErrorDescription})`
    )
  }

  log.error(errorMessage.join('\n'))

  throw new GitError(gitResult, args)
}

function getDescriptionForError(error: DugiteError): string {
  switch (error) {
    case DugiteError.SSHKeyAuditUnverified:
      return 'The SSH key is unverified.'
    case DugiteError.SSHAuthenticationFailed:
    case DugiteError.SSHPermissionDenied:
    case DugiteError.HTTPSAuthenticationFailed:
      return `Authentication failed. You may not have permission to access the repository or the repository may have been archived. Open ${
        __DARWIN__ ? 'preferences' : 'options'
      } and verify that you're signed in with an account that has permission to access this repository.`
    case DugiteError.RemoteDisconnection:
      return 'The remote disconnected. Check your Internet connection and try again.'
    case DugiteError.HostDown:
      return 'The host is down. Check your Internet connection and try again.'
    case DugiteError.RebaseConflicts:
      return 'We found some conflicts while trying to rebase. Please resolve the conflicts before continuing.'
    case DugiteError.MergeConflicts:
      return 'We found some conflicts while trying to merge. Please resolve the conflicts and commit the changes.'
    case DugiteError.HTTPSRepositoryNotFound:
    case DugiteError.SSHRepositoryNotFound:
      return 'The repository does not seem to exist anymore. You may not have access, or it may have been deleted or renamed.'
    case DugiteError.PushNotFastForward:
      return 'The repository has been updated since you last pulled. Try pulling before pushing.'
    case DugiteError.BranchDeletionFailed:
      return 'Could not delete the branch. It was probably already deleted.'
    case DugiteError.DefaultBranchDeletionFailed:
      return `The branch is the repository's default branch and cannot be deleted.`
    case DugiteError.RevertConflicts:
      return 'To finish reverting, please merge and commit the changes.'
    case DugiteError.EmptyRebasePatch:
      return 'There aren’t any changes left to apply.'
    case DugiteError.NoMatchingRemoteBranch:
      return 'There aren’t any remote branches that match the current branch.'
    case DugiteError.NothingToCommit:
      return 'There are no changes to commit.'
    case DugiteError.NoSubmoduleMapping:
      return 'A submodule was removed from .gitmodules, but the folder still exists in the repository. Delete the folder, commit the change, then try again.'
    case DugiteError.SubmoduleRepositoryDoesNotExist:
      return 'A submodule points to a location which does not exist.'
    case DugiteError.InvalidSubmoduleSHA:
      return 'A submodule points to a commit which does not exist.'
    case DugiteError.LocalPermissionDenied:
      return 'Permission denied.'
    case DugiteError.InvalidMerge:
      return 'This is not something we can merge.'
    case DugiteError.InvalidRebase:
      return 'This is not something we can rebase.'
    case DugiteError.NonFastForwardMergeIntoEmptyHead:
      return 'The merge you attempted is not a fast-forward, so it cannot be performed on an empty branch.'
    case DugiteError.PatchDoesNotApply:
      return 'The requested changes conflict with one or more files in the repository.'
    case DugiteError.BranchAlreadyExists:
      return 'A branch with that name already exists.'
    case DugiteError.BadRevision:
      return 'Bad revision.'
    case DugiteError.NotAGitRepository:
      return 'This is not a git repository.'
    case DugiteError.ProtectedBranchForcePush:
      return 'This branch is protected from force-push operations.'
    case DugiteError.ProtectedBranchRequiresReview:
      return 'This branch is protected and any changes requires an approved review. Open a pull request with changes targeting this branch instead.'
    case DugiteError.PushWithFileSizeExceedingLimit:
      return "The push operation includes a file which exceeds GitHub's file size restriction of 100MB. Please remove the file from history and try again."
    case DugiteError.HexBranchNameRejected:
      return 'The branch name cannot be a 40-character string of hexadecimal characters, as this is the format that Git uses for representing objects.'
    case DugiteError.ForcePushRejected:
      return 'The force push has been rejected for the current branch.'
    case DugiteError.InvalidRefLength:
      return 'A ref cannot be longer than 255 characters.'
    case DugiteError.CannotMergeUnrelatedHistories:
      return 'Unable to merge unrelated histories in this repository.'
    case DugiteError.PushWithPrivateEmail:
      return 'Cannot push these commits as they contain an email address marked as private on GitHub.'
    case DugiteError.LFSAttributeDoesNotMatch:
      return 'Git LFS attribute found in global Git configuration does not match expected value.'
    case DugiteError.ProtectedBranchDeleteRejected:
      return 'This branch cannot be deleted from the remote repository because it is marked as protected.'
    case DugiteError.ProtectedBranchRequiredStatus:
      return 'The push was rejected by the remote server because a required status check has not been satisfied.'
    case DugiteError.BranchRenameFailed:
      return 'The branch could not be renamed.'
    case DugiteError.PathDoesNotExist:
      return 'The path does not exist on disk.'
    case DugiteError.InvalidObjectName:
      return 'The object was not found in the Git repository.'
    case DugiteError.OutsideRepository:
      return 'This path is not a valid path inside the repository.'
    case DugiteError.LockFileAlreadyExists:
      return 'A lock file already exists in the repository, which blocks this operation from completing.'
    case DugiteError.NoMergeToAbort:
      return 'There is no merge in progress, so there is nothing to abort.'
    case DugiteError.NoExistingRemoteBranch:
      return 'The remote branch does not exist.'
    case DugiteError.LocalChangesOverwritten:
      return 'Some of your changes would be overwritten.'
    case DugiteError.UnresolvedConflicts:
      return 'There are unresolved conflicts in the working directory.'
    default:
      return assertNever(error, `Unknown error: ${error}`)
  }
}

/**
 * Return an array of command line arguments for network operation that override
 * the default git configuration values provided by local, global, or system
 * level git configs.
 *
 * These arguments should be inserted before the subcommand, i.e in
 * the case of `git pull` these arguments needs to go before the `pull`
 * argument.
 *
 * @param repository the local repository associated with the command, to check
 *                   local, global and system config for an existing value.
 *                   If `null` if provided (for example, when cloning a new
 *                   repository), this function will check global and system
 *                   config for an existing `protocol.version` setting
 *
 * @param account the identity associated with the repository, or `null` if
 *                unknown. The `protocol.version` behaviour is currently only
 *                enabled for GitHub.com repositories that don't have an
 *                existing `protocol.version` setting.
 */
export async function gitNetworkArguments(
  repository: Repository | null,
  account: IGitAccount | null
): Promise<ReadonlyArray<string>> {
  const baseArgs = [
    // Explicitly unset any defined credential helper, we rely on our
    // own askpass for authentication.
    '-c',
    'credential.helper=',
  ]

  if (!enableGitProtocolVersionTwo()) {
    return baseArgs
  }

  if (account === null) {
    return baseArgs
  }

  const isDotComAccount = account.endpoint === getDotComAPIEndpoint()

  if (!isDotComAccount) {
    return baseArgs
  }

  const name = 'protocol.version'

  const protocolVersion =
    repository != null
      ? await getConfigValue(repository, name)
      : await getGlobalConfigValue(name)

  if (protocolVersion !== null) {
    // protocol.version is already set, we should not override it with our own
    return baseArgs
  }

  // opt in for v2 of the Git Wire protocol for GitHub repositories
  return [...baseArgs, '-c', 'protocol.version=2']
}

/**
 * Returns the SHA of the passed in IGitResult
 * @param result
 */
export function parseCommitSHA(result: IGitResult): string {
  return result.stdout.split(']')[0].split(' ')[1]
}
