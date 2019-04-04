import * as React from 'react'

import { timeout } from '../../lib/promise'
import { formatRebaseValue } from '../../lib/rebase'

import { RichText } from '../lib/rich-text'

import { Dialog, DialogContent } from '../dialog'
import { Octicon, OcticonSymbol } from '../octicons'
import { RebaseProgressSummary } from '../../models/rebase'

interface IRebaseProgressDialogProps {
  /** Progress information about the current rebase */
  readonly progress: RebaseProgressSummary

  readonly emoji: Map<string, string>

  /**
   * An optional action to run when the component is mounted
   *
   * This should typically be the rebase action to perform.
   */
  readonly rebaseAction: (() => Promise<void>) | null
}

export class RebaseProgressDialog extends React.Component<
  IRebaseProgressDialogProps
> {
  private onDismissed = () => {
    // this dialog is undismissable, but I need to handle the event
  }

  /** After a delay, run the assigned action to start/continue the rebase */
  public async componentDidMount() {
    if (this.props.rebaseAction) {
      await timeout(500)
      await this.props.rebaseAction()
    }
  }

  public render() {
    const {
      rebasedCommitCount,
      commits,
      value,
      currentCommitSummary,
    } = this.props.progress
    const progressValue = formatRebaseValue(value)
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

            <div className="details">
              <div className="green-circle">
                <Octicon symbol={OcticonSymbol.check} />
              </div>
              <div className="summary">
                <div className="message">
                  Commit {rebasedCommitCount} of {commits.length}
                </div>
                <div className="detail">
                  <RichText
                    emoji={this.props.emoji}
                    text={currentCommitSummary || ''}
                  />
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }
}
