import * as React from 'react'
import * as Path from 'path'

import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Ref } from '../lib/ref'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Repository } from '../../models/repository'
import { Checkbox, CheckboxValue } from '../lib/checkbox'

interface IDeleteWorktreeDialogProps {
  readonly repository: Repository
  readonly worktreePath: string
  readonly askForConfirmationOnWorktreeRemoval: boolean
  readonly onDeleteWorktree: (
    repository: Repository,
    worktreePath: string
  ) => Promise<void>
  readonly onConfirmWorktreeRemovalChanged: (value: boolean) => void
  readonly onDismissed: () => void
}

interface IDeleteWorktreeDialogState {
  readonly isDeleting: boolean
  readonly confirmWorktreeRemoval: boolean
}

export class DeleteWorktreeDialog extends React.Component<
  IDeleteWorktreeDialogProps,
  IDeleteWorktreeDialogState
> {
  public constructor(props: IDeleteWorktreeDialogProps) {
    super(props)

    this.state = {
      isDeleting: false,
      confirmWorktreeRemoval: props.askForConfirmationOnWorktreeRemoval,
    }
  }

  public render() {
    const name = Path.basename(this.props.worktreePath)

    return (
      <Dialog
        id="delete-worktree"
        title={__DARWIN__ ? 'Delete Worktree' : 'Delete worktree'}
        type="warning"
        onSubmit={this.onSubmit}
        onDismissed={this.props.onDismissed}
        disabled={this.state.isDeleting}
        loading={this.state.isDeleting}
        role="alertdialog"
        ariaDescribedBy="delete-worktree-confirmation"
      >
        <DialogContent>
          <p id="delete-worktree-confirmation">
            Are you sure you want to delete the worktree <Ref>{name}</Ref>?
          </p>
          <Checkbox
            label="Do not show this message again"
            value={
              this.state.confirmWorktreeRemoval
                ? CheckboxValue.Off
                : CheckboxValue.On
            }
            onChange={this.onConfirmWorktreeRemovalChanged}
          />
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup destructive={true} okButtonText="Delete" />
        </DialogFooter>
      </Dialog>
    )
  }

  private onConfirmWorktreeRemovalChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = !event.currentTarget.checked
    this.setState({ confirmWorktreeRemoval: value })
  }

  private onSubmit = async () => {
    this.setState({ isDeleting: true })

    this.props.onConfirmWorktreeRemovalChanged(
      this.state.confirmWorktreeRemoval
    )

    await this.props.onDeleteWorktree(
      this.props.repository,
      this.props.worktreePath
    )
    this.props.onDismissed()
  }
}
