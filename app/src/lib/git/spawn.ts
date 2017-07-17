import { GitProcess } from 'dugite'

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
  return new Promise<ProcessOutput>((resolve, reject) => {
    const commandName = `${name}: git ${args.join(' ')}`
    log.debug(`Executing ${commandName}`)

    const startTime = performance && performance.now ? performance.now() : null

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

    function reportTimings() {
      if (startTime) {
        const rawTime = performance.now() - startTime
        if (rawTime > 1000) {
          const timeInSeconds = (rawTime / 1000).toFixed(3)
          log.info(`Executing ${commandName} (took ${timeInSeconds}s)`)
        }
      }
    }

    process.stdout.once('close', () => {
      // process.on('exit') may fire before stdout has closed, so this is a
      // more accurate point in time to measure that the command has completed
      // as we cannot proceed without the contents of the stdout stream
      reportTimings()

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
}
