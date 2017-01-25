import { spawn } from 'child_process'
import { platform } from 'os'

class Command {
  public name: string
  public args: string[]
}

/** Opens a shell setting the working directory to fullpath. If a shell is not specified, OS defaults are used. */
export function openShell(fullPath: string, shell?: string) {
  const currentPlatform = platform()
  const command = new Command

  switch (currentPlatform) {
    case 'darwin': {
      command.name = 'open'
      command.args = [ '-a', shell || 'Terminal', fullPath ]
      break
    }
    case 'win32': {
      command.name = 'start'
      command.args = [ '/D', '"%cd%"', shell || 'cmd', fullPath ]
      break
    }
  }

  return spawn(command.name, command.args)
}