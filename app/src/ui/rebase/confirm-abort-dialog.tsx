import * as React from 'react'

import { ButtonGroup } from '../lib/button-group'
import { Button } from '../lib/button'

import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OcticonSymbol, Octicon } from '../octicons'

const titleString = 'Confirm abort rebase'
const cancelButtonString = 'Cancel'
const abortButtonString = 'Abort rebase'

interface IConfirmAbortDialogProps {
  readonly baseBranch?: string
  readonly targetBranch: string

  readonly onReturnToConflicts: () => void
  readonly onConfirmAbort: () => Promise<void>
}

interface IConfirmAbortDialogState {
  readonly isAborting: boolean
}

export class ConfirmAbortDialog extends React.Component<
  IConfirmAbortDialogProps,
  IConfirmAbortDialogState
> {
  public constructor(props: IConfirmAbortDialogProps) {
    super(props)
    this.state = {
      isAborting: false,
    }
  }

  private onSubmit = async () => {
    this.setState({
      isAborting: true,
    })

    await this.props.onConfirmAbort()

    this.setState({
      isAborting: false,
    })
  }

  /**
   *  Dismisses the modal and shows the rebase conflicts modal
   */
  private onCancel = async () => {
    await this.props.onReturnToConflicts()
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
          Aborting this rebase will take you back to the original branch state
          and and the conflicts you have already resolved will be discarded.
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
        disabled={this.state.isAborting}
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
