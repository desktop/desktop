import { GitProcess } from 'dugite'
import { IGitSpawnExecutionOptions } from 'dugite/build/lib/git-process'
import * as GitPerf from '../../ui/lib/git-perf'
import { isErrnoException } from '../errno-exception'
import { withTrampolineEnv } from '../trampoline/trampoline-environment'

type ProcessOutput = {
  /** The contents of stdout received from the spawned process */
  output: Buffer
  /** The contents of stderr received from the spawned process */
  error: Buffer
  /** The exit code returned by the spawned process */
  exitCode: number | null
}

type SpawnOptions = IGitSpawnExecutionOptions & {
  /**
   * Whether the command about to run is part of a background task or not.
   * This affects error handling and UI such as credential prompts.
   */
  readonly isBackgroundTask?: boolean
}

/**
 * Spawn a Git process, deferring all processing work to the caller.
 *
 * @param args Array of strings to pass to the Git executable.
 * @param path The path to execute the command from.
 * @param name The name of the operation - for tracing purposes.
 * @param successExitCodes An optional array of exit codes that indicate success.
 * @param stdOutMaxLength  An optional maximum number of bytes to read from stdout.
 *                         If the process writes more than this number of bytes it
 *                         will be killed silently and the truncated output is
 *                         returned.
 */
export const spawnGit = (
  args: string[],
  path: string,
  name: string,
  options?: SpawnOptions
) =>
  withTrampolineEnv(
    trampolineEnv =>
      GitPerf.measure(`${name}: git ${args.join(' ')}`, async () =>
        GitProcess.spawn(args, path, {
          ...options,
          env: { ...options?.env, ...trampolineEnv },
        })
      ),
    path,
    options?.isBackgroundTask ?? false
  )

/**
 * Spawn a Git process and buffer the stdout and stderr streams, deferring
 * all processing work to the caller.
 *
 * @param args Array of strings to pass to the Git executable.
 * @param path The path to execute the command from.
 * @param name The name of the operation - for tracing purposes.
 * @param successExitCodes An optional array of exit codes that indicate success.
 * @param stdOutMaxLength  An optional maximum number of bytes to read from stdout.
 *                         If the process writes more than this number of bytes it
 *                         will be killed silently and the truncated output is
 *                         returned.
 */
export async function spawnAndComplete(
  args: string[],
  path: string,
  name: string,
  successExitCodes?: Set<number>,
  stdOutMaxLength?: number
): Promise<ProcessOutput> {
  return new Promise<ProcessOutput>(async (resolve, reject) => {
    const process = await spawnGit(args, path, name)

    process.on('error', err => {
      // If this is an exception thrown by Node.js while attempting to
      // spawn let's keep the salient details but include the name of
      // the operation.
      if (isErrnoException(err)) {
        reject(new Error(`Failed to execute ${name}: ${err.code}`))
      } else {
        // for unhandled errors raised by the process, let's surface this in the
        // promise and make the caller handle it
        reject(err)
      }
    })

    let totalStdoutLength = 0
    let killSignalSent = false

    const stdoutChunks = new Array<Buffer>()

    // If Node.js encounters a synchronous runtime error while spawning
    // `stdout` will be undefined and the error will be emitted asynchronously
    if (process.stdout) {
      process.stdout.on('data', (chunk: Buffer) => {
        if (!stdOutMaxLength || totalStdoutLength < stdOutMaxLength) {
          stdoutChunks.push(chunk)
          totalStdoutLength += chunk.length
        }

        if (
          stdOutMaxLength &&
          totalStdoutLength >= stdOutMaxLength &&
          !killSignalSent
        ) {
          process.kill()
          killSignalSent = true
        }
      })
    }

    const stderrChunks = new Array<Buffer>()

    // See comment above about stdout and asynchronous errors.
    if (process.stderr) {
      process.stderr.on('data', (chunk: Buffer) => {
        stderrChunks.push(chunk)
      })
    }

    process.on('close', (code, signal) => {
      const stdout = Buffer.concat(
        stdoutChunks,
        stdOutMaxLength
          ? Math.min(stdOutMaxLength, totalStdoutLength)
          : totalStdoutLength
      )

      const stderr = Buffer.concat(stderrChunks)

      // mimic the experience of GitProcess.exec for handling known codes when
      // the process terminates
      const exitCodes = successExitCodes || new Set([0])

      if ((code !== null && exitCodes.has(code)) || signal) {
        resolve({
          output: stdout,
          error: stderr,
          exitCode: code,
        })
        return
      } else {
        reject(
          new Error(
            `Git returned an unexpected exit code '${code}' which should be handled by the caller (${name}).'`
          )
        )
      }
    })
  })
}
