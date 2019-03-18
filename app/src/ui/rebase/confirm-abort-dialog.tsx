import * as React from 'react'

import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OcticonSymbol, Octicon } from '../octicons'
import { ButtonGroup } from '../lib/button-group'
import { Button } from '../lib/button'

const titleString = 'Confirm abort rebase'
const cancelButtonString = 'Cancel'
const abortButtonString = 'Abort rebase'

interface IConfirmAbortDialogProps {
  readonly baseBranch?: string
  readonly targetBranch: string

  readonly onReturnToConflicts: () => void
  readonly onConfirmAbort: () => void
}

export class ConfirmAbortDialog extends React.Component<
  IConfirmAbortDialogProps
> {
  private onSubmit = async () => {
    this.props.onConfirmAbort()
  }

  /**
   *  dismisses the modal and shows the rebase conflicts modal
   */
  private onCancel = () => {
    this.props.onReturnToConflicts()
  }

  private renderTextContent(targetBranch: string, baseBranch?: string) {
    let firstParagraph

    if (baseBranch !== undefined) {
      firstParagraph = (
        <p>
          {'Are you sure you want to abort rebasing '}
          <strong>{baseBranch}</strong>
          {' onto '}
          <strong>{targetBranch}</strong>?
        </p>
      )
    } else {
      firstParagraph = (
        <p>
          {'Are you sure you want to abort rebasing '}
          <strong>{targetBranch}</strong>?
        </p>
      )
    }

    return (
      <div className="column-left">
        {firstParagraph}
        <p>
          Aborting this merge will take you back to the pre-merge state and the
          conflicts you've already resolved will still be present.
        </p>
      </div>
    )
  }

  public render() {
    return (
      <Dialog
        id="abort-merge-warning"
        title={titleString}
        dismissable={false}
        onDismissed={this.onCancel}
        onSubmit={this.onSubmit}
      >
        <DialogContent className="content-wrapper">
          <Octicon symbol={OcticonSymbol.alert} />
          {this.renderTextContent(
            this.props.targetBranch,
            this.props.baseBranch
          )}
        </DialogContent>
        <DialogFooter>
          <ButtonGroup>
            <Button type="submit">{abortButtonString}</Button>
            <Button onClick={this.onCancel}>{cancelButtonString}</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }
}
