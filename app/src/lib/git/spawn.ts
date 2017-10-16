import { GitProcess } from 'dugite'
import * as GitPerf from '../../ui/lib/git-perf'

type ProcessOutput = {
  output: Buffer
  error: Buffer
}

/**
 * Spawn a Git process and buffer the stdout and stderr streams, deferring
 * all processing work to the caller.
 *
 * @param args Array of strings to pass to the Git executable.
 * @param path The path to execute the command from.
 * @param name The name of the operation - for tracing purposes.
 * @param successExitCodes An optional array of exit codes that indicate success.
 */
export function spawnAndComplete(
  args: string[],
  path: string,
  name: string,
  successExitCodes?: Set<number>
): Promise<ProcessOutput> {
  const commandName = `${name}: git ${args.join(' ')}`
  return GitPerf.measure(
    commandName,
    () =>
      new Promise<ProcessOutput>((resolve, reject) => {
        const process = GitProcess.spawn(args, path)

        const stdout = new Array<Buffer>()
        let output: Buffer | undefined
        process.stdout.on('data', chunk => {
          stdout.push(chunk as Buffer)
        })

        const stderr = new Array<Buffer>()
        let error: Buffer | undefined
        process.stderr.on('data', chunk => {
          stderr.push(chunk as Buffer)
        })

        process.stdout.once('close', () => {
          output = Buffer.concat(stdout)

          if (output && error) {
            resolve({ output, error })
          }
        })

        process.stderr.once('close', () => {
          error = Buffer.concat(stderr)

          if (output && error) {
            resolve({ output, error })
          }
        })

        process.on('error', err => {
          // for unhandled errors raised by the process, let's surface this in the
          // promise and make the caller handle it
          reject(err)
        })

        process.on('exit', (code, signal) => {
          // mimic the experience of GitProcess.exec for handling known codes when
          // the process terminates
          const exitCodes = successExitCodes || new Set([0])
          if (!exitCodes.has(code)) {
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
