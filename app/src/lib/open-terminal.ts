import { spawn } from 'child_process'
import { platform } from 'os'

export function openTerminal(fullPath: string) {
  const currentPlatform = platform()
  let command = ''

  switch (currentPlatform) {
    case 'darwin': {
      command = 'open -a Terminal'
      break
    }
    case 'win32': {
      command = 'start /D "%cd%" cmd'
      break
    }
  }

  return spawn('open', [ '-a', 'Terminal', fullPath ])
}