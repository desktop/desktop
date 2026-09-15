import * as React from 'react'

import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { TerminalOutputListener } from '../../lib/git'
import { Terminal } from '../terminal'
interface ICommitProgressProps {
  readonly subscribeToCommitOutput: TerminalOutputListener
  readonly onDismissed: () => void
}

/** A component to confirm and then discard changes. */
export class CommitProgress extends React.Component<ICommitProgressProps> {
  private unsubscribe?: () => void | null
  private terminalRef = React.createRef<Terminal>()

  private onDismissed = () => {
    this.unsubscribe?.()
    this.unsubscribe = undefined
    this.props.onDismissed()
  }

  public componentDidMount() {
    const { unsubscribe } = this.props.subscribeToCommitOutput(chunk =>
      this.terminalRef.current?.write(chunk)
    )

    this.unsubscribe = unsubscribe
  }

  public componentWillUnmount() {
    this.unsubscribe?.()
    this.unsubscribe = undefined
  }

  public render() {
    return (
      <Dialog
        id="commit-progress-dialog"
        title={`Committing changes`}
        onDismissed={this.onDismissed}
        onSubmit={this.onDismissed}
      >
        <DialogContent>
          <Terminal
            ref={this.terminalRef}
            hideCursor={true}
            cols={80}
            rows={20}
          />
        </DialogContent>

        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={'Close'}
            cancelButtonVisible={false}
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
