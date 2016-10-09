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
 * `successExitCodes` a `GitError` will be thrown.
 */
export async function git(args: string[], path: string, options?: IGitExecutionOptions): Promise<IGitResult> {

  const defaultOptions: IGitExecutionOptions = {
    successExitCodes: new Set([ 0 ]),
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

  if (!opts.successExitCodes!.has(exitCode)) {
    console.error(`The command \`${args.join(' ')}\` exited with an unexpected code: ${exitCode}. The caller should either handle this error, or expect that exit code.`)
    if (result.stdout.length) {
      console.error(result.stdout)
    }

    if (result.stderr.length) {
      console.error(result.stderr)
    }

    let gitError = GitProcess.parseError(result.stderr)
    if (!gitError) {
      gitError = GitProcess.parseError(result.stdout)
    }

    if (gitError) {
      console.error(`(The error was parsed as ${gitError}.)`)
    }

    throw new GitError(result, args, gitError)
  }

  return result
}
