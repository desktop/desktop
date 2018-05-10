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
  launchSSHAgent,
  isHostVerificationError,
  isPermissionError,
  executeSSHTest,
  findSSHAgentProcess,
  findSSHAgentPath,
  createSSHKey,
  addToSSHAgent,
} from '../ssh'
import { getRemotes } from '../git'
import { parseRemote } from '../remote-parsing'

const initialState: TroubleshootingState = {
  kind: TroubleshootingStep.WelcomeState,
  sshUrl: '',
  isLoading: false,
}

export class TroubleshootingStore extends TypedBaseStore<TroubleshootingState> {
  private state = initialState
  private accounts: ReadonlyArray<Account> = []

  public constructor(private accountsStore: AccountsStore) {
    super()

    this.accountsStore.onDidUpdate(async () => {
      const accounts = await this.accountsStore.getAll()
      this.accounts = accounts
    })
  }

  /**
   * Update the internal state of the store and emit an update
   * event.
   */
  private setState(state: TroubleshootingState) {
    this.state = state
    this.emitUpdate(this.getState())
  }

  /**
   * Returns the current state of the sign in store or null if
   * no sign in process is in flight.
   */
  public getState(): TroubleshootingState {
    return this.state
  }

  public reset() {
    this.setState(initialState)
  }

  public async start(repository: Repository) {
    this.setState({
      kind: TroubleshootingStep.WelcomeState,
      sshUrl: '',
      isLoading: true,
    })

    const remotes = await getRemotes(repository)

    const sshRemotes: Array<string> = []
    for (const remote of remotes) {
      const gitRemote = parseRemote(remote.url)
      if (gitRemote != null && gitRemote.protocol === 'ssh') {
        sshRemotes.push(gitRemote.hostname)
      }
    }

    // TODO: it'd be nice to know the specific remote associated with this error
    // for multi-remote scenarios, but these are less common than the
    // single-remote scenario so this isn't a priority. Maybe we can show a UI
    // for displaying the remotes to work with, where there are multiple SSH
    // remotes?
    const sshUrl = `git@${sshRemotes[0]}`
    await this.validateSSHConnection(sshUrl)
  }

  public async validateHost(state: IValidateHostState) {
    this.setState({ ...state, isLoading: true })
    await scanAndWriteToKnownHostsFile(state.host)
    await this.validateSSHConnection(state.sshUrl)
  }

  public async launchSSHAgent(state: INoRunningAgentState) {
    this.setState({ ...state, isLoading: true })

    const { id, environmentVariables } = await launchSSHAgent(state.sshLocation)
    // TODO: IPC to the main process to indicate it should cleanup this process
    log.debug(`[TroubleshootingStore] launched ssh-agent process with id ${id}`)
    // TODO: how to pass this through when invoking Git
    log.debug(
      `[TroubleshootingStore] found environment variables to pass through: '${environmentVariables.join(
        ', '
      )}'`
    )

    await this.validateSSHConnection(state.sshUrl)
  }

  public async createSSHKey(
    account: Account,
    emailAddress: string,
    passphrase: string,
    outputFile: string
  ) {
    const state = this.state
    if (state.kind !== TroubleshootingStep.CreateSSHKey) {
      return
    }

    this.setState({
      ...state,
      isLoading: true,
    })

    const { privateKeyFile } = await createSSHKey(
      emailAddress,
      passphrase,
      outputFile
    )
    await addToSSHAgent(privateKeyFile, passphrase)
    //await uploadToGitHub(publicKeyFile)

    await this.validateSSHConnection(state.sshUrl)
  }

  private async validateSSHConnection(sshUrl: string) {
    const isSSHAgentRunning = await findSSHAgentProcess()

    if (!isSSHAgentRunning) {
      // TODO: find ssh-agent on PATH? Or somewhere else?
      const sshAgentLocation = await findSSHAgentPath()

      if (sshAgentLocation == null) {
        log.warn(
          `[TroubleshootingStore] unable to find an ssh-agent on the machine. what to do?`
        )
        return
      }

      this.setState({
        kind: TroubleshootingStep.NoRunningAgent,
        sshLocation: sshAgentLocation,
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
