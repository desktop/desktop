import { spawn as spawnCore } from 'child_process'

/** Spawn a command with arguments and capture its output. */
export function spawn(
  command: string,
  args: ReadonlyArray<string>
): Promise<string> {
  try {
    const child = spawnCore(command, args as string[])
    return new Promise<string>((resolve, reject) => {
      let stdout = ''
      child.stdout.on('data', data => {
        stdout += data
      })

      child.on('close', code => {
        if (code === 0) {
          resolve(stdout)
        } else {
          reject(new Error(`Command "${command} ${args}" failed: "${stdout}"`))
        }
      })

      child.on('error', (err: Error) => {
        reject(err)
      })

      // This is necessary if using Powershell 2 on Windows 7 to get the events
      // to raise.
      // See http://stackoverflow.com/questions/9155289/calling-powershell-from-nodejs
      child.stdin.end()
    })
  } catch (error) {
    return Promise.reject(error)
  }
}
