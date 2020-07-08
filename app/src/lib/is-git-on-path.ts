import { spawn, SpawnOptionsWithoutStdio } from 'child_process'
import * as Path from 'path'

function captureCommandOutput(
  command: string,
  args: string[],
  options: SpawnOptionsWithoutStdio = {}
): Promise<string | undefined> {
  return new Promise<string | undefined>((resolve, reject) => {
    const cp = spawn(command, args, options)

    cp.on('error', error => {
      log.warn(`Unable to spawn ${command}`, error)
      resolve(undefined)
    })

    const chunks = new Array<Buffer>()
    let total = 0

    cp.stdout.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
      total += chunk.length
    })

    cp.on('close', function (code) {
      if (code !== 0) {
        resolve(undefined)
      } else {
        resolve(
          Buffer.concat(chunks, total)
            .toString()
            .replace(/\r?\n[^]*/m, '')
        )
      }
    })
  })
}

export function findGitOnPath(): Promise<string | undefined> {
  // adapted from http://stackoverflow.com/a/34953561/1363815
  if (__WIN32__) {
    const windowsRoot = process.env.SystemRoot || 'C:\\Windows'
    const wherePath = Path.join(windowsRoot, 'System32', 'where.exe')

    // `where` will list _all_ PATH components where the executable
    // is found, one per line, and return 0, or print an error and
    // return 1 if it cannot be found
    log.info(`calling captureCommandOutput(where git)`)
    return captureCommandOutput(wherePath, ['git'], { cwd: windowsRoot })
  }

  if (__DARWIN__ || __LINUX__) {
    // `which` will print the path and return 0 when the executable
    // is found under PATH, or return 1 if it cannot be found
    return captureCommandOutput('which', ['git'])
  }

  return Promise.resolve(undefined)
}

export async function isGitOnPath(): Promise<boolean> {
  // Modern versions of macOS ship with a Git shim that guides you through
  // the process of setting everything up. We trust this is available, so
  // don't worry about looking for it here.
  if (__DARWIN__) {
    return Promise.resolve(true)
  }

  return (await findGitOnPath()) !== undefined
}
