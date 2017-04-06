import { spawn } from 'child_process'
import { fatalError } from './fatal-error'

/** Opens a shell setting the working directory to fullpath. If a shell is not specified, OS defaults are used. */
export function openShell(fullPath: string, shell?: string) {
  if ( __DARWIN__) {
    // fullPath argument ensures a new terminal is always shown
    const commandArgs = [ '-a', shell || 'Terminal', fullPath ]
    return spawn('open', commandArgs, { 'shell': true })
  }

  if (__WIN32__) {
    // not sure what other sorts of arguments we expect here
    // so for now let's just try and launch this other shell
    return spawn('START', [ shell || 'cmd' ], { 'shell': true, cwd: fullPath })
  }

  return fatalError('Unsupported OS')
}

export function isGitOnPath(): Promise<boolean> {
  // adapted from http://stackoverflow.com/a/34953561/1363815
  const command = __WIN32__ ? 'where' : 'whereis'

  return new Promise<boolean>((resolve, reject) => {
    const options = { encoding: 'utf8' }
    const process = spawn(command, [ 'git' ], options)

    if (__WIN32__) {
      // `where` will return 0 when the executable
      // is found under PATH, or 1 if it cannot be found
      process.on('close', function (code) {
        resolve(code === 0)
      })
      return
    }

    // `whereis` always returns an exit code of 0 but when
    // successful it will write the path to stdout
    let outputReceived = false
    process.stdout.on('data', data => {
      outputReceived = true
      resolve(data.length > 0)
    })

    process.on('close', code => {
      if (!outputReceived) {
        resolve(false)
      }
    })
  })
}
