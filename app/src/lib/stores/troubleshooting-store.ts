import { TypedBaseStore } from './base-store'
import { AccountsStore } from './accounts-store'

import {
  TroubleshootingState,
  TroubleshootingStep,
  IValidateHostState,
  INoRunningAgentState,
} from '../../models/ssh'
import { Account } from '../../models/account'
import { Repository } from '../../models/repository'
import {
  scanAndWriteToKnownHostsFile,
  isHostVerificationError,
  isPermissionError,
  executeSSHTest,
  findSSHAgentProcess,
} from '../ssh'

export class TroubleshootingStore extends TypedBaseStore<TroubleshootingState | null> {
  private state: TroubleshootingState | null = null
  private accounts: ReadonlyArray<Account> = []

  public constructor(private accountsStore: AccountsStore) {
    super()

    this.reset()

    this.accountsStore.onDidUpdate(async () => {
      const accounts = await this.accountsStore.getAll()
      this.accounts = accounts
    })
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
    this.setState({ kind: TroubleshootingStep.WelcomeState, sshUrl: '' })
  }

  public async validateHost(state: IValidateHostState) {
    this.setState({ ...state, isLoading: true })
    await scanAndWriteToKnownHostsFile(state.host)
    await this.validate(state.sshUrl)
  }

  public async launchSSHAgent(state: INoRunningAgentState) {
    this.setState({ ...state, isLoading: true })

    // TODO: actually launch the process
    // TODO: IPC to the main process to indicate it should cleanup this process
    // TODO: grab environment variables from ssh-agent process
    // TODO: how to pass this through when invoking Git

    // for now, just dummy this up and re-evaluate again
    window.setTimeout(() => {
      this.validate(state.sshUrl)
    }, 2000)
  }

  public async start(repository: Repository) {
    // TODO: how to resolve this from the repository?
    // TODO: how to resolve the host for GHE environments?
    const sshUrl = 'git@github.com'

    this.setState({
      kind: TroubleshootingStep.WelcomeState,
      sshUrl,
      isLoading: true,
    })

    await this.validate(sshUrl)
  }

  private async validate(sshUrl: string) {
    const isSSHAgentRunning = await findSSHAgentProcess()

    if (!isSSHAgentRunning) {
      // TODO: find ssh-agent on PATH? Or somewhere else?
      this.setState({
        kind: TroubleshootingStep.NoRunningAgent,
        sshLocation: '/usr/bin/ssh-agent',
        sshUrl,
      })
      return
    }

    const stderr = await executeSSHTest(sshUrl)

    const verificationError = isHostVerificationError(stderr)
    if (verificationError !== null) {
      const { rawOutput, host } = verificationError
      this.setState({
        kind: TroubleshootingStep.ValidateHost,
        rawOutput,
        host,
        sshUrl,
      })
      return
    }

    if (isPermissionError(stderr)) {
      // TODO: nail down this flow
      //  - if we have existing keys, show and let the user choose
      //     - they may wish to skip to instead create a new key
      //  - choose a GitHub or GitHub Enterprise account
      //     - detect whether these accounts have

      const foundKeys = 0

      if (foundKeys > 0) {
        // TODO: list keys and let the user select a key
      } else {
        this.setState({
          kind: TroubleshootingStep.CreateSSHKey,
          accounts: this.accounts,
          sshUrl,
        })
        return
      }
      return
    }

    this.setState({
      kind: TroubleshootingStep.Unknown,
      error: stderr,
    })
  }
}
