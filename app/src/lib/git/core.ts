import * as Path from 'path'
import { User } from '../../models/user'
import { assertNever } from '../fatal-error'

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
 * @param {options}          Configuration options for the execution of git,
 *                           see IGitExecutionOptions for more information.
 *
 * Returns the result. If the command exits with a code not in
 * `successExitCodes` or an error not in `expectedErrors`, a `GitError` will be
 * thrown.
 */
export async function git(args: string[], path: string, options?: IGitExecutionOptions): Promise<IGitResult> {

  const defaultOptions: IGitExecutionOptions = {
    successExitCodes: new Set([ 0 ]),
    expectedErrors: new Set(),
  }

  const opts = Object.assign({ }, defaultOptions, options)

  const startTime = (performance && performance.now) ? performance.now() : null

  const result = await GitProcess.exec(args, path, options)

  if (console.debug && startTime) {
    const rawTime = performance.now() - startTime
    if (rawTime > 100) {
     const timeInSeconds = (rawTime / 1000).toFixed(3)
     console.debug(`executing: git ${args.join(' ')} (took ${timeInSeconds}s)`)
    }
  }

  const exitCode = result.exitCode

  let gitError: GitKitchenSinkError | null = null
  const acceptableExitCode = opts.successExitCodes!.has(exitCode)
  if (!acceptableExitCode) {
    gitError = GitProcess.parseError(result.stderr)
    if (!gitError) {
      gitError = GitProcess.parseError(result.stdout)
    }
  }

  const gitErrorDescription = gitError ? getDescriptionForError(gitError) : null
  const gitResult = Object.assign({}, result, { gitError, gitErrorDescription })

  if (!acceptableExitCode || (gitError && !opts.expectedErrors!.has(gitError))) {
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

  return gitResult
}

function getDescriptionForError(error: GitKitchenSinkError): string {
  switch (error) {
    case GitKitchenSinkError.GitNotFound: return 'Git not found'
    case GitKitchenSinkError.SSHKeyAuditUnverified: return 'The SSH key is unverified'
    case GitKitchenSinkError.SSHAuthenticationFailed: return 'Authentication failed'
    case GitKitchenSinkError.SSHPermissionDenied: return 'Permission denied'
    case GitKitchenSinkError.HTTPSAuthenticationFailed: return 'Authentication failed'
    case GitKitchenSinkError.RemoteDisconnection: return 'The remote disconnected'
    case GitKitchenSinkError.HostDown: return 'The host is down'
    case GitKitchenSinkError.RebaseConflicts: return 'There are rebase conflicts'
    case GitKitchenSinkError.MergeConflicts: return 'There are merge conflicts'
    case GitKitchenSinkError.HTTPSRepositoryNotFound: return 'The repository could not be found'
    case GitKitchenSinkError.SSHRepositoryNotFound: return 'The repository could not be found'
    case GitKitchenSinkError.PushNotFastForward: return 'The push was rejected. Pull and try again.'
    case GitKitchenSinkError.BranchDeletionFailed: return 'Branch deletion failed'
    case GitKitchenSinkError.DefaultBranchDeletionFailed: return 'Cannot delete the default branch'
    case GitKitchenSinkError.RevertConflicts: return 'There are conflicts after reverting'
    case GitKitchenSinkError.EmptyRebasePatch: return 'Could not apply patch'
    case GitKitchenSinkError.NoMatchingRemoteBranch: return 'No matching remote branch'
    case GitKitchenSinkError.NothingToCommit: return 'There is nothing to commit'
    case GitKitchenSinkError.NoSubmoduleMapping: return 'There is no submodule mapping'
    case GitKitchenSinkError.SubmoduleRepositoryDoesNotExist: return 'Submodule repository does not exist'
    case GitKitchenSinkError.InvalidSubmoduleSHA: return 'Invalid submodule SHA'
    case GitKitchenSinkError.LocalPermissionDenied: return 'Permission denied'
    case GitKitchenSinkError.InvalidMerge: return 'Invalid merge'
    case GitKitchenSinkError.InvalidRebase: return 'Invalid rebase'
    case GitKitchenSinkError.NonFastForwardMergeIntoEmptyHead: return 'Non-fast forward merge into an empty HEAD'
    case GitKitchenSinkError.PatchDoesNotApply: return 'Patch does not apply'
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
  if (!user) { return {} }

  return {
    'DESKTOP_PATH': process.execPath,
    'DESKTOP_ASKPASS_SCRIPT': getAskPassScriptPath(),
    'DESKTOP_USERNAME': user.login,
    'DESKTOP_ENDPOINT': user.endpoint,
    'GIT_ASKPASS': getAskPassTrampolinePath(),
  }
}
