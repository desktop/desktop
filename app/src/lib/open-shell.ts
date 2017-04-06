import { spawn } from 'child_process'
import { fatalError } from './fatal-error'
import { platform } from 'os'

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
  const isWindows = platform().indexOf('win') > -1

  const command = isWindows ? 'where' : 'whereis'

  return new Promise<boolean>((resolve, reject) => {
    const options = { encoding: 'utf8', shell: true }
    const out = spawn(command + ' git', [ '/?' ], options)

    out.on('close', function (code) {
      resolve(code === 0)
    })
  })
}
