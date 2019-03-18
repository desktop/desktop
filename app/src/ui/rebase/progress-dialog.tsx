import * as React from 'react'

import { Dialog, DialogContent } from '../dialog'
import { clamp } from '../../lib/clamp'

interface IRebaseProgressDialogProps {
  readonly value: number

  readonly actionToRun?: () => Promise<void>

  // to simplify testing flow, should be removed once this is working
  readonly onDismissed: () => void
}

export class RebaseProgressDialog extends React.Component<
  IRebaseProgressDialogProps,
  {}
> {
  private onDismissed = () => {
    this.props.onDismissed()
  }

  public componentDidMount() {
    if (this.props.actionToRun) {
      // after a delay, run the action and listen for results
      const action = this.props.actionToRun

      setTimeout(() => {
        action()
      }, 500)
    }
  }

  public render() {
    const progressValue = Math.round(clamp(this.props.value, 0, 1) * 100) / 100
    const progressNumber = (progressValue * 100).toFixed(0)

    return (
      <Dialog
        dismissable={false}
        onDismissed={this.onDismissed}
        disableClickDismissalAlways={false}
        id="rebase-progress"
        title="Rebase in progress"
      >
        <DialogContent>
          <div>
            <progress value={progressValue} />

            <h2>{progressNumber}% rebase completed</h2>
          </div>
        </DialogContent>
      </Dialog>
    )
  }
}
