import * as Path from 'path'
import { User } from '../../models/user'
import { assertNever } from '../fatal-error'
import * as GitPerf from '../../ui/lib/git-perf'

import {
  GitProcess,
  IGitResult as GitKitchenSinkResult,
  GitError as GitKitchenSinkError,
  IGitExecutionOptions as GitKitchenSinkExecutionOptions,
} from 'git-kitchen-sink'

/**
 * An extension of the execution options in git-kitchen-sink that
 * allows us to piggy-back our own configuration options in the
 * same object.
 */
export interface IGitExecutionOptions extends GitKitchenSinkExecutionOptions {
  /**
   * The exit codes which indicate success to the
   * caller. Unexpected exit codes will be logged and an
   * error thrown. Defaults to 0 if undefined.
   */
  readonly successExitCodes?: Set<number>

  /**
   * The git errors which are expected by the caller. Unexpected errors will
   * be logged and an error thrown.
   */
  readonly expectedErrors?: Set<GitKitchenSinkError>
}

/**
 * The result of using `git`. This wraps git-kitchen-sink's results to provide
 * the parsed error if one occurs.
 */
export interface IGitResult extends GitKitchenSinkResult {
  /**
   * The parsed git error. This will be null when the exit code is include in
   * the `successExitCodes`, or when git-kitchen-sink was unable to parse the
   * error.
   */
  readonly gitError: GitKitchenSinkError | null

  /** The human-readable error description, based on `gitError`. */
  readonly gitErrorDescription: string | null
}

export class GitError {
  /** The result from the failed command. */
  public readonly result: IGitResult

  /** The args for the failed command. */
  public readonly args: ReadonlyArray<string>

  public constructor(result: IGitResult, args: ReadonlyArray<string>) {
    this.result = result
    this.args = args
  }

  public get message(): string {
    const description = this.result.gitErrorDescription
    if (description) {
      return description
    }

    if (this.result.stderr.length) {
      return this.result.stderr
    } else if (this.result.stdout.length) {
      return this.result.stdout
    } else {
      return `Unknown error`
    }
  }
}

/**
 * Shell out to git with the given arguments, at the given path.
 *
 * @param {args}             The arguments to pass to `git`.
 *
 * @param {path}             The working directory path for the execution of the
 *                           command.
 *
 * @param {name}             The name for the command based on its caller's
 *                           context. This will be used for performance
 *                           measurements and debugging.
 *
 * @param {options}          Configuration options for the execution of git,
 *                           see IGitExecutionOptions for more information.
 *
 * Returns the result. If the command exits with a code not in
 * `successExitCodes` or an error not in `expectedErrors`, a `GitError` will be
 * thrown.
 */
export async function git(args: string[], path: string, name: string, options?: IGitExecutionOptions): Promise<IGitResult> {

  const defaultOptions: IGitExecutionOptions = {
    successExitCodes: new Set([ 0 ]),
    expectedErrors: new Set(),
  }

  const opts = { ...defaultOptions, ...options }

  const startTime = (performance && performance.now) ? performance.now() : null

  const commandName = `${name}: git ${args.join(' ')}`

  const result = await GitPerf.measure(commandName, () => GitProcess.exec(args, path, options))

  if (console.debug && startTime) {
    const rawTime = performance.now() - startTime
    if (rawTime > 100) {
     const timeInSeconds = (rawTime / 1000).toFixed(3)
     console.debug(`executing: ${commandName} (took ${timeInSeconds}s)`)
    }
  }

  const exitCode = result.exitCode

  let gitError: GitKitchenSinkError | null = null
  const acceptableExitCode = opts.successExitCodes ? opts.successExitCodes.has(exitCode) : false
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

  console.error(`The command \`git ${args.join(' ')}\` exited with an unexpected code: ${exitCode}. The caller should either handle this error, or expect that exit code.`)
  if (result.stdout.length) {
    console.error(result.stdout)
  }

  if (result.stderr.length) {
    console.error(result.stderr)
  }

  if (gitError) {
    console.error(`(The error was parsed as ${gitError}: ${gitErrorDescription})`)
  }

  throw new GitError(gitResult, args)
}

function getDescriptionForError(error: GitKitchenSinkError): string {
  switch (error) {
    case GitKitchenSinkError.GitNotFound: return 'Git could not be found.'
    case GitKitchenSinkError.SSHKeyAuditUnverified: return 'The SSH key is unverified.'
    case GitKitchenSinkError.SSHAuthenticationFailed:
    case GitKitchenSinkError.SSHPermissionDenied:
    case GitKitchenSinkError.HTTPSAuthenticationFailed: return 'Authentication failed. You may not have permission to access the repository.'
    case GitKitchenSinkError.RemoteDisconnection: return 'The remote disconnected. Check your Internet connection and try again.'
    case GitKitchenSinkError.HostDown: return 'The host is down. Check your Internet connection and try again.'
    case GitKitchenSinkError.RebaseConflicts: return 'We found some conflicts while trying to rebase. Please resolve the conflicts before continuing.'
    case GitKitchenSinkError.MergeConflicts: return 'We found some conflicts while trying to merge. Please resolve the conflicts and commit the changes.'
    case GitKitchenSinkError.HTTPSRepositoryNotFound:
    case GitKitchenSinkError.SSHRepositoryNotFound: return 'The repository does not seem to exist anymore. You may not have access, or it may have been deleted or renamed.'
    case GitKitchenSinkError.PushNotFastForward: return 'The repository has been updated since you last pulled. Try pulling before pushing.'
    case GitKitchenSinkError.BranchDeletionFailed: return 'Could not delete the branch. It was probably already deleted.'
    case GitKitchenSinkError.DefaultBranchDeletionFailed: return `The branch is the repository's default branch and cannot be deleted.`
    case GitKitchenSinkError.RevertConflicts: return 'To finish reverting, please merge and commit the changes.'
    case GitKitchenSinkError.EmptyRebasePatch: return 'There aren’t any changes left to apply.'
    case GitKitchenSinkError.NoMatchingRemoteBranch: return 'There aren’t any remote branches that match the current branch.'
    case GitKitchenSinkError.NothingToCommit: return 'There are no changes to commit.'
    case GitKitchenSinkError.NoSubmoduleMapping: return 'A submodule was removed from .gitmodules, but the folder still exists in the repository. Delete the folder, commit the change, then try again.'
    case GitKitchenSinkError.SubmoduleRepositoryDoesNotExist: return 'A submodule points to a location which does not exist.'
    case GitKitchenSinkError.InvalidSubmoduleSHA: return 'A submodule points to a commit which does not exist.'
    case GitKitchenSinkError.LocalPermissionDenied: return 'Permission denied'
    case GitKitchenSinkError.InvalidMerge: return 'This is not something we can merge.'
    case GitKitchenSinkError.InvalidRebase: return 'This is not something we can rebase.'
    case GitKitchenSinkError.NonFastForwardMergeIntoEmptyHead: return 'The merge you attempted is not a fast-forward, so it cannot be performed on an empty branch.'
    case GitKitchenSinkError.PatchDoesNotApply: return 'The requested changes conflict with one or more files in the repository.'
    case GitKitchenSinkError.BranchAlreadyExists: return 'A branch with that name already exists'
    case GitKitchenSinkError.BadRevision: return 'Bad revision'
    default: return assertNever(error, `Unknown error: ${error}`)
  }
}

function getAskPassTrampolinePath(): string {
  const extension = __WIN32__ ? 'bat' : 'sh'
  return Path.resolve(__dirname, 'static', `ask-pass-trampoline.${extension}`)
}

function getAskPassScriptPath(): string {
  return Path.resolve(__dirname, 'ask-pass.js')
}

/** Get the environment for authenticating remote operations. */
export function envForAuthentication(user: User | null): Object {
  const env: any = {
    'DESKTOP_PATH': process.execPath,
    'DESKTOP_ASKPASS_SCRIPT': getAskPassScriptPath(),
    'GIT_ASKPASS': getAskPassTrampolinePath(),
    // supported since Git 2.3, this is used to ensure we never interactively prompt
    // for credentials - even as a fallback
    'GIT_TERMINAL_PROMPT': '0',
    // by setting HOME to an empty value Git won't look at ~ for any global
    // configuration values. This means we won't accidentally use a
    // credential.helper value if it's been set by the current user
    'HOME': '',
  }

  if (!user) {
    return env
  }

  return Object.assign(env, {
    'DESKTOP_USERNAME': user.login,
    'DESKTOP_ENDPOINT': user.endpoint,
  })
}

export function expectedAuthenticationErrors(): Set<GitKitchenSinkError> {
  return new Set([
      GitKitchenSinkError.HTTPSAuthenticationFailed,
      GitKitchenSinkError.SSHAuthenticationFailed,
      GitKitchenSinkError.HTTPSRepositoryNotFound,
      GitKitchenSinkError.SSHRepositoryNotFound,
  ])
}
