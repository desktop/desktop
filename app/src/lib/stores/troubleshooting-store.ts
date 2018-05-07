import { exec, spawn } from 'child_process'
import * as os from 'os'
import * as Path from 'path'
import * as fs from 'fs'
import { mkdirIfNeeded } from '../file-system'
import { isExecutableOnPath } from '../find-executable'

import { TypedBaseStore } from './base-store'
import { TroubleshootingState, TroubleshootingStep } from '../../models/ssh'
import { Repository } from '../../models/repository'

/** Spawn a command with arguments and capture its output. */
function spawnAndComplete(
  command: string,
  args: ReadonlyArray<string>
): Promise<string> {
  try {
    const child = spawn(command, args as string[])
    return new Promise<string>((resolve, reject) => {
      let stdout = ''
      child.stdout.on('data', data => {
        stdout += data
      })

      child.on('close', code => {
        if (code === 0) {
          resolve(stdout)
        } else {
          reject(new Error(`Command "${command} ${args}" failed: "${stdout}"`))
        }
      })

      child.on('error', (err: Error) => {
        reject(err)
      })

      // This is necessary if using Powershell 2 on Windows 7 to get the events
      // to raise.
      // See http://stackoverflow.com/questions/9155289/calling-powershell-from-nodejs
      child.stdin.end()
    })
  } catch (error) {
    return Promise.reject(error)
  }
}

/** Get the path segments in the user's `Path`. */
async function getPathSegments(): Promise<ReadonlyArray<string>> {
  let powershellPath: string
  const systemRoot = process.env.SystemRoot
  if (systemRoot != null) {
    const system32Path = Path.join(systemRoot, 'System32')
    powershellPath = Path.join(
      system32Path,
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe'
    )
  } else {
    powershellPath = 'powershell.exe'
  }

  const args = [
    '-noprofile',
    '-ExecutionPolicy',
    'RemoteSigned',
    '-command',
    // Set encoding and execute the command, capture the output, and return it
    // via .NET's console in order to have consistent UTF-8 encoding.
    // See http://stackoverflow.com/questions/22349139/utf-8-output-from-powershell
    // to address https://github.com/atom/atom/issues/5063
    `
      [Console]::OutputEncoding=[System.Text.Encoding]::UTF8
      $output=[environment]::GetEnvironmentVariable('Path', 'User')
      [Console]::WriteLine($output)
    `,
  ]

  const stdout = await spawnAndComplete(powershellPath, args)
  const pathOutput = stdout.replace(/^\s+|\s+$/g, '')
  return pathOutput.split(/;+/).filter(segment => segment.length)
}

async function getEnvironment(executable: string) {
  const found = await isExecutableOnPath(executable)

  if (found) {
    // no need to setup our own environment, inherit the default
    return process.env
  }

  if (!__WIN32__) {
    log.warn('appending the path is currently Windows-specific code for now')
    log.warn(
      `skipping this work because I'm not sure how many users are actually affected by this`
    )
    return process.env
  }

  const paths = await getPathSegments()
  const localGitDir = process.env['LOCAL_GIT_DIRECTORY']

  if (localGitDir == null) {
    log.warn('unable to find path to the embedded Git installation')
    return process.env
  }
  const updatedPaths = [...paths, Path.join(localGitDir, 'usr', 'bin')]
  const path = updatedPaths.join(';')

  return Object.assign({}, process.env, { path })
}

export class TroubleshootingStore extends TypedBaseStore<TroubleshootingState | null> {
  private state: TroubleshootingState | null = null

  public constructor() {
    super()

    this.reset()
  }

  /**
   * Update the internal state of the store and emit an update
   * event.
   */
  private setState(state: TroubleshootingState | null) {
    this.state = state
    this.emitUpdate(this.getState())
  }

  /**
   * Returns the current state of the sign in store or null if
   * no sign in process is in flight.
   */
  public getState(): TroubleshootingState | null {
    return this.state
  }

  public reset() {
    this.setState({ kind: TroubleshootingStep.InitialState, isLoading: false })
  }

  public async validateHost(host: string) {
    const homeDir = os.homedir()
    const sshDir = Path.join(homeDir, '.ssh')
    await mkdirIfNeeded(sshDir)

    const knownHostsPath = Path.join(homeDir, '.ssh', 'known_hosts')

    return new Promise<void>((resolve, reject) => {
      const keyscan = spawn(`ssh-keyscan`, [host])
      keyscan.stdout.pipe(fs.createWriteStream(knownHostsPath))
      keyscan.on('close', (code, signal) => {
        if (code !== 0) {
          reject(
            new Error(
              `ssh-keyscan exited with code '${code}' while adding '${host}' which was not expected`
            )
          )
          return
        }
        resolve()
      })
    })
  }

  public start(repository: Repository) {
    this.setState({ kind: TroubleshootingStep.InitialState, isLoading: true })
    const command = 'ssh'
    const env = getEnvironment(command)

    // TODO: how to resolve the host for GHE environments?
    const host = 'git@github.com'

    exec(
      `${command} -Tv  -o 'StrictHostKeyChecking=yes' ${host}`,
      { timeout: 15000, env },
      (error, stdout, stderr) => {
        if (error != null) {
          // TODO: poke at these details, pass them through
        }

        const noValidHostKeyFoundRe = /No RSA host key is known for (.*) and you have requested strict checking/
        const hostMatch = noValidHostKeyFoundRe.exec(stderr)

        if (hostMatch != null) {
          const host = hostMatch[1]

          const fingerprintRe = /Server host key: (.*) (.*)/
          const match = fingerprintRe.exec(stderr)

          if (match == null) {
            log.warn(
              `Could not find fingerprint details where they were expected`
            )
            // TODO: redirect to generic error
            return
          }

          const fingerprint = match[2]
          const rawOutput = `The authenticity of host '${host}' can't be established.\nRSA key fingerprint is ${fingerprint}.`

          this.setState({
            kind: TroubleshootingStep.ValidateHost,
            rawOutput,
            host,
          })
        } else {
          this.setState({
            kind: TroubleshootingStep.Unknown,
            output: stdout,
            error: stderr,
          })
        }
      }
    )
  }
}
