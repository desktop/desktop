import * as React from 'react'
import { RichText } from '../lib/rich-text'
import { Dialog, DialogContent } from '../dialog'
import { Octicon, OcticonSymbol } from '../octicons'
import { ICherryPickProgress } from '../../models/progress'

interface ICherryPickProgressDialogProps {
  /** Progress information about the current cherry pick */
  readonly progress: ICherryPickProgress

  readonly emoji: Map<string, string>
}

export class CherryPickProgressDialog extends React.Component<
  ICherryPickProgressDialogProps
> {
  // even tho dialog is not dismissable, it requires an onDismissed method
  private onDismissed = () => {}

  public render() {
    const {
      cherryPickCommitCount,
      totalCommitCount,
      value,
      currentCommitSummary,
    } = this.props.progress

    return (
      <Dialog
        dismissable={false}
        onDismissed={this.onDismissed}
        id="cherry-pick-progress"
        title="Cherry-pick in progress"
      >
        <DialogContent>
          <div>
            <progress value={value} />

            <div className="details">
              <div className="green-circle">
                <Octicon symbol={OcticonSymbol.check} />
              </div>
              <div className="summary">
                <div className="message">
                  Commit {cherryPickCommitCount} of {totalCommitCount}
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
