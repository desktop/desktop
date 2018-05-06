import { TypedBaseStore } from './base-store'
import { TroubleshootingState, TroubleshootingStep } from '../../models/ssh'
import { Repository } from '../../models/repository'
import { exec } from 'child_process'

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

  public start(repository: Repository) {
    this.setState({ kind: TroubleshootingStep.InitialState, isLoading: true })

    exec(
      'ssh -Tv git@github.com',
      { timeout: 15000 },
      (error, stdout, stderr) => {
        if (error != null) {
          // TODO: poke at these details, pass them through
        }

        this.setState({
          kind: TroubleshootingStep.Unknown,
          output: stdout,
          error: stderr,
        })
      }
    )
  }
}
