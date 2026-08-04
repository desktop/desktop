import * as React from 'react'
import * as Path from 'path'

import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Ref } from '../lib/ref'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Repository } from '../../models/repository'
import { Branch } from '../../models/branch'
import { Checkbox, CheckboxValue } from '../lib/checkbox'

interface IDeleteWorktreeDialogProps {
  readonly repository: Repository
  readonly worktreePath: string
  /**
   * Whether the worktree's folder is already gone. Removing it then only clears
   * the repository's record of it, so the wording differs and there's nothing
   * destructive to opt out of confirming.
   */
  readonly isMissing: boolean
  /** Branch to check out once the worktree has been removed, if any. */
  readonly branchToCheckout?: Branch
  readonly askForConfirmationOnWorktreeRemoval: boolean
  readonly onDeleteWorktree: (
    repository: Repository,
    worktreePath: string,
    force?: boolean,
    branchToCheckout?: Branch
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
    const { isMissing } = this.props
    const name = Path.basename(this.props.worktreePath)

    const title = isMissing
      ? __DARWIN__
        ? 'Remove Missing Worktree'
        : 'Remove missing worktree'
      : __DARWIN__
      ? 'Delete Worktree'
      : 'Delete worktree'

    return (
      <Dialog
        id="delete-worktree"
        title={title}
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
            {isMissing ? (
              <>
                The folder for the worktree <Ref>{name}</Ref> no longer exists.
                Remove it from this repository?
              </>
            ) : (
              <>
                Are you sure you want to delete the worktree <Ref>{name}</Ref>?
              </>
            )}
          </p>
          {/*
            Only offered for a real deletion. Opting out from here would also
            silence the confirmation for worktrees that still have contents.
          */}
          {!isMissing && (
            <Checkbox
              label="Do not show this message again"
              value={
                this.state.confirmWorktreeRemoval
                  ? CheckboxValue.Off
                  : CheckboxValue.On
              }
              onChange={this.onConfirmWorktreeRemovalChanged}
            />
          )}
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            destructive={true}
            okButtonText={isMissing ? 'Remove' : 'Delete'}
          />
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
      this.props.worktreePath,
      undefined,
      this.props.branchToCheckout
    )
    this.props.onDismissed()
  }
}
