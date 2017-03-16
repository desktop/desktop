import { spawn } from 'child_process'
import { fatalError } from './fatal-error'

/** Opens a shell setting the working directory to fullpath. If a shell is not specified, OS defaults are used. */
export function openShell(fullPath: string, shell?: string) {
  let commandName: string = ''
  let commandArgs: ReadonlyArray<string>

  if ( __DARWIN__) {
    commandName = 'open'
    commandArgs = [ '-a', shell || 'Terminal' ]
  } else if (__WIN32__) {
    commandName = 'START'
    if (shell) {
      // not sure what other sorts of arguments we expect here
      // so for now let's just try and launch this other shell
      commandArgs = [ shell ]
    } else {
      // '/K' to run the subseqent command and keep the prompt visible
      // 'TITLE {value}' sets the Command Prompt title to {value}
      commandArgs = [ 'cmd', '/K', 'TITLE GitHub Desktop' ]
    }
  } else {
    return fatalError('Unsupported OS')
  }

  return spawn(commandName, Array.from(commandArgs), { 'shell': true, cwd: fullPath })
}
