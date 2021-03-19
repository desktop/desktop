import * as React from 'react'

import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Ref } from '../lib/ref'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { ConfirmAbortStep } from '../../models/cherry-pick'

interface IConfirmCherryPickAbortDialogProps {
  readonly step: ConfirmAbortStep
  readonly commitCount: number
  readonly sourceBranchName: string | null

  readonly onReturnToConflicts: (step: ConfirmAbortStep) => void
  readonly onConfirmAbort: () => Promise<void>
}

interface IConfirmCherryPickAbortDialogState {
  readonly isAborting: boolean
}

export class ConfirmCherryPickAbortDialog extends React.Component<
  IConfirmCherryPickAbortDialogProps,
  IConfirmCherryPickAbortDialogState
> {
  public constructor(props: IConfirmCherryPickAbortDialogProps) {
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

  private onCancel = async () => {
    await this.props.onReturnToConflicts(this.props.step)
  }

  private renderTextContent() {
    const { commitCount, step, sourceBranchName } = this.props
    const { targetBranchName } = step.conflictState

    const pluralize = commitCount > 1 ? 'commits' : 'commit'
    const confirm = (
      <p>
        {`Are you sure you want to abort cherry-picking ${commitCount} ${pluralize}`}
        {' onto '}
        <Ref>{targetBranchName}</Ref>?
      </p>
    )

    let returnTo = null
    if (sourceBranchName !== null) {
      returnTo = (
        <>
          {' and you will be taken back to '}
          <Ref>{sourceBranchName}</Ref>
        </>
      )
    }

    return (
      <div className="column-left">
        {confirm}
        <p>
          {'The conflicts you have already resolved will be discarded'}
          {returnTo}
          {'.'}
        </p>
      </div>
    )
  }

  public render() {
    return (
      <Dialog
        id="abort-merge-warning"
        title={
          __DARWIN__ ? 'Confirm Abort Cherry-pick' : 'Confirm abort cherry-pick'
        }
        onDismissed={this.onCancel}
        onSubmit={this.onSubmit}
        disabled={this.state.isAborting}
        type="warning"
      >
        <DialogContent>{this.renderTextContent()}</DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            destructive={true}
            okButtonText={
              __DARWIN__ ? 'Abort Cherry-pick' : 'Abort cherry-pick'
            }
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
