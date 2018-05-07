import { exec, spawn } from 'child_process'
import * as os from 'os'
import * as Path from 'path'
import * as fs from 'fs'

import { TypedBaseStore } from './base-store'
import { mkdirIfNeeded } from '../file-system'

import { TroubleshootingState, TroubleshootingStep } from '../../models/ssh'
import { Repository } from '../../models/repository'
import { getSSHEnvironment, isHostVerificationError } from '../ssh'

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

    const command = 'ssh-keyscan'
    const env = await getSSHEnvironment(command)

    return new Promise<void>((resolve, reject) => {
      const keyscan = spawn(command, [host], { shell: true, env })
      const knownHostsPath = Path.join(homeDir, '.ssh', 'known_hosts')

      keyscan.stdout.pipe(fs.createWriteStream(knownHostsPath))

      keyscan.on('error', err => {
        // TODO: need to end up in the "I give up" part of the flow
        log.warn(`unable to spawn ssh-keyscan`, err)
      })

      keyscan.on('close', code => {
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

  public async start(repository: Repository) {
    this.setState({ kind: TroubleshootingStep.InitialState, isLoading: true })
    const command = 'ssh'
    const env = await getSSHEnvironment(command)

    // TODO: how to resolve the host for GHE environments?
    const host = 'git@github.com'

    exec(
      `${command} -Tv  -o 'StrictHostKeyChecking=yes' ${host}`,
      { timeout: 15000, env },
      (error, stdout, stderr) => {
        if (error != null) {
          // TODO: poke at these details, pass them through
        }

        const verificationError = isHostVerificationError(stderr)
        if (verificationError !== null) {
          const { rawOutput, host } = verificationError
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
