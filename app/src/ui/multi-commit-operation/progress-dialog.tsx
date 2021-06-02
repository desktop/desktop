import * as React from 'react'
import { formatRebaseValue } from '../../lib/rebase'
import { RichText } from '../lib/rich-text'
import { Dialog, DialogContent } from '../dialog'
import { Octicon, OcticonSymbol } from '../octicons'
import { IMultiCommitOperationProgress } from '../../models/progress'

interface IProgressDialogProps {
  /**
   * This is expected to be capitalized.
   *
   * Examples:
   *  - Rebase
   *  - Cherry-pick
   *  - Squash
   *  - Reorder
   */
  readonly operation: string
  readonly progress: IMultiCommitOperationProgress
  readonly emoji: Map<string, string>
}

export class ProgressDialog extends React.Component<IProgressDialogProps> {
  public render() {
    const { progress, operation, emoji } = this.props
    const { position, totalCommitCount, value, currentCommitSummary } = progress

    const progressValue = formatRebaseValue(value)
    return (
      <Dialog
        dismissable={false}
        id="multi-commit-progress"
        title={`${operation} in progress`}
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
                  Commit {position} of {totalCommitCount}
                </div>
                <div className="detail">
                  <RichText emoji={emoji} text={currentCommitSummary || ''} />
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }
}
