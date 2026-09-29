import * as Fs from 'fs'
import * as Os from 'os'
import * as Path from 'path'
import { app } from 'electron'
import type { IPty } from 'node-pty'
import type { WebContents } from 'electron'
import * as ipcMain from './ipc-main'
import * as ipcWebContents from './ipc-webcontents'
import { IIntegratedTerminalOptions } from '../lib/integrated-terminal'

interface ITerminalSession {
  readonly pty: IPty
  readonly webContents: WebContents
}

const sessions = new Map<number, ITerminalSession>()
let nextSessionId = 1

/**
 * Get the shell to launch in the integrated terminal.
 *
 * Windows PowerShell on Windows and the user's login shell elsewhere (zsh on
 * a stock macOS install).
 */
function getShell(): { file: string; args: string[] } {
  if (process.platform === 'win32') {
    return { file: 'powershell.exe', args: ['-NoLogo'] }
  }

  const shell = process.env.SHELL
  if (process.platform === 'darwin') {
    return { file: shell || '/bin/zsh', args: ['-l'] }
  }

  return { file: shell || '/bin/bash', args: [] }
}

/**
 * node-pty's published package ships its macOS spawn-helper without the
 * executable bit which makes spawning fail with "posix_spawnp failed". The
 * build fixes the permissions but make sure here too, e.g. for builds made
 * before that fix.
 */
async function ensureSpawnHelperIsExecutable() {
  if (process.platform !== 'darwin') {
    return
  }

  const helper = Path.join(
    app.getAppPath(),
    'node_modules',
    'node-pty',
    'prebuilds',
    `${process.platform}-${process.arch}`,
    'spawn-helper'
  )

  try {
    await Fs.promises.access(helper, Fs.constants.X_OK)
  } catch {
    try {
      await Fs.promises.chmod(helper, 0o755)
    } catch (e) {
      log.warn(`Unable to make ${helper} executable`, e)
    }
  }
}

async function getWorkingDirectory(cwd: string | null) {
  try {
    if (cwd !== null && (await Fs.promises.stat(cwd)).isDirectory()) {
      return cwd
    }
  } catch {
    // Fall back to the home directory below
  }
  return Os.homedir()
}

function getEnvironment(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value
    }
  }

  // Don't leak Electron specifics into the user's shell
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ELECTRON_NO_ATTACH_CONSOLE

  env.TERM = 'xterm-256color'
  env.COLORTERM = 'truecolor'
  env.TERM_PROGRAM = __APP_NAME__

  return env
}

function kill(id: number) {
  const session = sessions.get(id)
  if (session === undefined) {
    return
  }

  sessions.delete(id)
  try {
    session.pty.kill()
  } catch (e) {
    log.warn(`Failed to kill integrated terminal ${id}`, e)
  }
}

/** Kill all integrated terminal sessions, e.g. when the app is quitting. */
export function killAllIntegratedTerminals() {
  for (const id of [...sessions.keys()]) {
    kill(id)
  }
}

/**
 * Register the IPC handlers which lets the renderer create and interact with
 * pseudo terminals running the user's shell.
 */
export function registerIntegratedTerminalHandlers() {
  ipcMain.handle(
    'integrated-terminal-create',
    async (event, options: IIntegratedTerminalOptions) => {
      // Loaded lazily so that a missing or broken native module only breaks
      // the integrated terminal rather than the whole app.
      const { spawn } = await import('node-pty')
      await ensureSpawnHelperIsExecutable()

      const { file, args } = getShell()
      const pty = spawn(file, args, {
        name: 'xterm-256color',
        cols: Math.max(options.cols, 1),
        rows: Math.max(options.rows, 1),
        cwd: await getWorkingDirectory(options.cwd),
        env: getEnvironment(),
      })

      const id = nextSessionId++
      const webContents = event.sender
      sessions.set(id, { pty, webContents })

      pty.onData(data => {
        if (!webContents.isDestroyed()) {
          ipcWebContents.send(webContents, 'integrated-terminal-data', id, data)
        }
      })

      pty.onExit(({ exitCode }) => {
        sessions.delete(id)
        if (!webContents.isDestroyed()) {
          ipcWebContents.send(
            webContents,
            'integrated-terminal-exit',
            id,
            exitCode
          )
        }
      })

      // Clean up if the window goes away (e.g. reloads) while the shell runs
      webContents.once('destroyed', () => kill(id))

      return id
    }
  )

  ipcMain.on('integrated-terminal-write', (_, id, data) => {
    sessions.get(id)?.pty.write(data)
  })

  ipcMain.on('integrated-terminal-resize', (_, id, cols, rows) => {
    const session = sessions.get(id)
    if (session !== undefined && cols > 0 && rows > 0) {
      try {
        session.pty.resize(cols, rows)
      } catch (e) {
        log.warn(`Failed to resize integrated terminal ${id}`, e)
      }
    }
  })

  ipcMain.on('integrated-terminal-kill', (_, id) => kill(id))
}
