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
      command.name = 'START'
      command.args = [ '/D', `"${fullPath}"` , 'title', 'GitHub Desktop' ]
      break
    }
  }

  const process = spawn(command.name, command.args, { 'shell' : true })

  process.stdout.on('data', (data) => {
    console.log(`stdout: ${data}`)
  })

  process.stderr.on('data', (data) => {
    console.log(`stderr: ${data}`)
  })

  process.on('close', (code) => {
    console.log(`process exited with code ${code}`)
  })
}