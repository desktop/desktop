import { spawn } from 'child_process'
import { platform } from 'os'
import { Dispatcher } from './dispatcher/dispatcher'
import { assertNever } from '../lib/fatal-error'

export function openTerminal(fullPath: string, dispatcher: Dispatcher) {
  const os = platform()
  let command = ''

  switch (os) {
    case 'darwin': command = ''
    case 'win32': command = ''
  }
}