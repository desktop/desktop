import * as Path from 'path'
import { User } from '../../models/user'

import {
  GitProcess,
  IGitResult,
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
}

export class GitError {
  /** The result from the failed command. */
  public readonly result: IGitResult

  /** The args for the failed command. */
  public readonly args: ReadonlyArray<string>

  /**
   * The error as parsed by git-kitchen-sink. May be null if it wasn't able to
   * determine the error.
   */
  public readonly parsedError: GitKitchenSinkError | null

  public constructor(result: IGitResult, args: ReadonlyArray<string>, parsedError: GitKitchenSinkError | null) {
    this.result = result
    this.args = args
    this.parsedError = parsedError
  }

  public get message(): string {
    const parsedError = this.parsedError
    if (parsedError) {
      return `Error ${parsedError}`
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

  if (!acceptableExitCode || (gitError && !opts.expectedErrors!.has(gitError))) {
    console.error(`The command \`git ${args.join(' ')}\` exited with an unexpected code: ${exitCode}. The caller should either handle this error, or expect that exit code.`)
    if (result.stdout.length) {
      console.error(result.stdout)
    }

    if (result.stderr.length) {
      console.error(result.stderr)
    }

    if (gitError) {
      console.error(`(The error was parsed as ${gitError}.)`)
    }

    throw new GitError(result, args, gitError)
  }

  return result
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
