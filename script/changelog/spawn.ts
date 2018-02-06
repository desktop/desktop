import * as ChildProcess from 'child_process'

export function spawn(
  cmd: string,
  args: ReadonlyArray<string>
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = ChildProcess.spawn(cmd, args as string[], { shell: true })
    let receivedData = ''

    child.on('error', reject)

    child.stdout.on('data', data => {
      receivedData += data
    })

    child.on('close', (code, signal) => {
      if (code === 0) {
        resolve(receivedData)
      } else {
        reject(
          new Error(
            `'${cmd} ${args.join(
              ' '
            )}' exited with code ${code}, signal ${signal}`
          )
        )
      }
    })
  })
}
