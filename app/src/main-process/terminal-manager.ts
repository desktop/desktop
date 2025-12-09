import { spawn, ChildProcess } from 'child_process'
import { BrowserWindow } from 'electron'
import { v4 as uuid } from 'uuid'
import * as ipcWebContents from './ipc-webcontents'
import * as os from 'os'
import * as fs from 'fs'
import * as path from 'path'

interface ITerminalInstance {
  id: string
  window: BrowserWindow
  cwd: string
  process: ChildProcess | null
  inputBuffer: string
}

const terminals = new Map<string, ITerminalInstance>()

/**
 * Create a new terminal instance using the script command for PTY
 */
export function createTerminal(window: BrowserWindow, cwd: string): string {
  const id = uuid()

  const instance: ITerminalInstance = {
    id,
    window,
    cwd,
    process: null,
    inputBuffer: '',
  }

  terminals.set(id, instance)

  // Use the script command to create a PTY on macOS/Linux
  // script -q /dev/null creates a PTY without writing to a file
  const shell = process.env.SHELL || '/bin/bash'

  // Create temporary file for script command (macOS requires a file argument)
  const tempFile = path.join(os.tmpdir(), `terminal-${id}.log`)

  // Use script command which allocates a PTY
  // -q = quiet mode, -F = flush after each write
  const scriptArgs = process.platform === 'darwin'
    ? ['-q', '-F', tempFile, shell]
    : ['-q', '-c', shell, tempFile]

  const child = spawn('script', scriptArgs, {
    cwd,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      SHELL: shell,
      HOME: os.homedir(),
      PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',
      LANG: process.env.LANG || 'en_US.UTF-8',
      // Disable history file to avoid permission issues
      HISTFILE: '',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  instance.process = child

  child.stdout?.on('data', (data: Buffer) => {
    if (!window.isDestroyed()) {
      let output = data.toString()
      // Filter out the script command header/footer messages
      output = output.replace(/^Script started.*\n/gm, '')
      output = output.replace(/^Script done.*\n/gm, '')
      if (output) {
        ipcWebContents.send(window.webContents, 'terminal-data', id, output)
      }
    }
  })

  child.stderr?.on('data', (data: Buffer) => {
    if (!window.isDestroyed()) {
      ipcWebContents.send(window.webContents, 'terminal-data', id, data.toString())
    }
  })

  child.on('close', (code) => {
    // Clean up temp file
    try {
      fs.unlinkSync(tempFile)
    } catch (e) {
      // Ignore cleanup errors
    }

    if (!window.isDestroyed()) {
      ipcWebContents.send(window.webContents, 'terminal-exit', id, code ?? 0)
    }
    terminals.delete(id)
  })

  child.on('error', (err) => {
    console.error(`Terminal error: ${err.message}`)
    if (!window.isDestroyed()) {
      ipcWebContents.send(window.webContents, 'terminal-data', id, `Error: ${err.message}\r\n`)
    }
  })

  console.log(`Terminal created: ${id}, cwd: ${cwd}, shell: ${shell}`)

  return id
}

/**
 * Write data to a terminal
 */
export function writeToTerminal(id: string, data: string): void {
  const instance = terminals.get(id)
  if (!instance || !instance.process) return

  // Write directly to the PTY (script command handles input/output)
  instance.process.stdin?.write(data)
}

/**
 * Resize a terminal
 */
export function resizeTerminal(id: string, cols: number, rows: number): void {
  const instance = terminals.get(id)
  if (!instance || !instance.process) return

  // Send resize signal - this works because script creates a real PTY
  // We can use SIGWINCH to resize, but we need to set the terminal size
  // Unfortunately, without node-pty we can't easily resize the PTY
  // This is a limitation of the script command approach
}

/**
 * Kill a terminal
 */
export function killTerminal(id: string): void {
  const instance = terminals.get(id)
  if (instance?.process) {
    instance.process.kill('SIGTERM')
  }
  terminals.delete(id)
}

/**
 * Kill all terminals for a window
 */
export function killAllTerminalsForWindow(window: BrowserWindow): void {
  for (const [id, instance] of terminals) {
    if (instance.window === window) {
      if (instance.process) {
        instance.process.kill('SIGTERM')
      }
      terminals.delete(id)
    }
  }
}
