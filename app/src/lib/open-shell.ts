import { spawn } from 'child_process'
import { fatalError } from './fatal-error'

/** Opens a shell setting the working directory to fullpath. If a shell is not specified, OS defaults are used. */
export function openShell(fullPath: string, shell?: string) {
  let commandName: string = ''
  let commandArgs: ReadonlyArray<string>

  if ( __DARWIN__) {
    commandName = 'open'
    commandArgs = [ '-a', shell || 'Terminal', fullPath ]
  }
  else if (__WIN32__) {
    commandName = 'START'
    commandArgs = [ shell || 'cmd', '/D', `"${fullPath}"` , 'title', 'GitHub Desktop' ]
  }
  else {
    return fatalError('Unsupported OS')
  }

  return spawn(commandName, Array.from(commandArgs), { 'shell' : true })
}
