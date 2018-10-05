import { spawn } from 'child_process'
import * as Path from 'path'

export function findExecutableOnPath(
  executableName: string
): Promise<string | null> {
  // adapted from http://stackoverflow.com/a/34953561/1363815
  if (__WIN32__) {
    return new Promise<string | null>((resolve, reject) => {
      const windowsRoot = process.env.SystemRoot || 'C:\\Windows'
      const wherePath = Path.join(windowsRoot, 'System32', 'where.exe')

      const stdoutChunks = new Array<Buffer>()
      let totalStdoutLength = 0

      const cp = spawn(wherePath, [executableName])

      cp.stdout.on('data', (chunk: Buffer) => {
        stdoutChunks.push(chunk)
        totalStdoutLength += chunk.length
      })

      cp.on('error', error => {
        log.warn('Unable to spawn where.exe', error)
        resolve(null)
      })

      // `where` will return 0 when the executable
      // is found under PATH, or 1 if it cannot be found
      cp.on('close', function(code) {
        if (code === 0) {
          const stdout = Buffer.concat(stdoutChunks, totalStdoutLength)
          resolve(stdout.toString().trim())
        } else {
          resolve(null)
        }
      })
    })
  }

  if (__LINUX__ || __DARWIN__) {
    return new Promise<string | null>((resolve, reject) => {
      const cp = spawn('which', [executableName])

      const stdoutChunks = new Array<Buffer>()
      let totalStdoutLength = 0

      cp.stdout.on('data', (chunk: Buffer) => {
        stdoutChunks.push(chunk)
        totalStdoutLength += chunk.length
      })

      // `which` will return 0 when the executable
      // is found under PATH, or 1 if it cannot be found
      cp.on('close', function(code) {
        if (code === 0) {
          const stdout = Buffer.concat(stdoutChunks, totalStdoutLength)
          resolve(stdout.toString().trim())
        } else {
          resolve(null)
        }
      })
    })
  }

  return Promise.resolve(null)
}
