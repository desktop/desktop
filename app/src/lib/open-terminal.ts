import { spawn } from 'child_process'
import { platform } from 'os'

class Command {
  public name: string
  public args: string[]
}

export function openTerminal(fullPath: string) {
  const currentPlatform = platform()
  const command = new Command()

  switch (currentPlatform) {
    case 'darwin': {
      command.name = 'open'
      command.args = [ '-a', 'Terminal', fullPath ]
      break
    }
    case 'win32': {
      command.name = 'start'
      command.args = [ '/D', '"%cd%"', 'cmd', fullPath ]
      break
    }
  }

  return spawn(command.name, command.args)
}