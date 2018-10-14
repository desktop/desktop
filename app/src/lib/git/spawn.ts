import { GitProcess } from 'dugite'
import * as GitPerf from '../../ui/lib/git-perf'

type ProcessOutput = {
  /** The contents of stdout received from the spawned process */
  output: Buffer
  /** The contents of stderr received from the spawned process */
  error: Buffer
  /** The exit code returned by the spawned process */
  exitCode: number
}

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
export function spawnAndComplete(
  args: string[],
  path: string,
  name: string,
  successExitCodes?: Set<number>,
  stdOutMaxLength?: number
): Promise<ProcessOutput> {
  const commandName = `${name}: git ${args.join(' ')}`
  return GitPerf.measure(
    commandName,
    () =>
      new Promise<ProcessOutput>((resolve, reject) => {
        const process = GitProcess.spawn(args, path)
        let totalStdoutLength = 0
        let killSignalSent = false

        const stdoutChunks = new Array<Buffer>()
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

        const stderrChunks = new Array<Buffer>()
        process.stderr.on('data', (chunk: Buffer) => {
          stderrChunks.push(chunk)
        })

        process.on('error', err => {
          // for unhandled errors raised by the process, let's surface this in the
          // promise and make the caller handle it
          reject(err)
        })

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

          if (exitCodes.has(code) || signal) {
            resolve({
              output: stdout,
              error: stderr,
              exitCode: code,
            })
            return
          } else {
            reject(
              new Error(
                `Git returned an unexpected exit code '${code}' which should be handled by the caller.'`
              )
            )
          }
        })
      })
  )
}
