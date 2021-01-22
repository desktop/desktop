import * as React from 'react'

import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'
import { Branch, BranchType } from '../../models/branch'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Ref } from '../lib/ref'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'

interface IDeleteBranchProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly branch: Branch
  readonly existsOnRemote: boolean
  readonly onDismissed: () => void
  readonly onDeleted: (repository: Repository) => void
}

interface IDeleteBranchState {
  readonly includeRemoteBranch: boolean
  readonly isDeleting: boolean
}

export class DeleteBranch extends React.Component<
  IDeleteBranchProps,
  IDeleteBranchState
> {
  public constructor(props: IDeleteBranchProps) {
    super(props)

    this.state = {
      includeRemoteBranch: this.props.branch.type === BranchType.Remote,
      isDeleting: false,
    }
  }

  public render() {
    return (
      <Dialog
        id="delete-branch"
        title={this.getDeleteBranchDialogHeader()}
        type="warning"
        onSubmit={this.deleteBranch}
        onDismissed={this.props.onDismissed}
        disabled={this.state.isDeleting}
        loading={this.state.isDeleting}
      >
        <DialogContent>
          <p>
            Delete branch <Ref>{this.props.branch.name}</Ref>?<br />
            This action cannot be undone.
          </p>

          {this.renderDeleteOnRemote()}
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup destructive={true} okButtonText="Delete" />
        </DialogFooter>
      </Dialog>
    )
  }

  private getDeleteBranchDialogHeader(): string {
    const isOnlyRemote =
      this.props.branch.type === BranchType.Remote && this.props.existsOnRemote
    const remoteHeader = __DARWIN__
      ? 'Delete Remote Branch'
      : 'Delete remote branch'
    const localHeader = __DARWIN__ ? 'Delete Branch' : 'Delete branch'
    return isOnlyRemote ? remoteHeader : localHeader
  }

  private renderDeleteOnRemote() {
    if (
      !this.props.existsOnRemote ||
      (this.props.branch.type !== BranchType.Remote &&
        this.props.branch.remote === null)
    ) {
      return
    }

    /**
     * Two possibilities - (1) local and remote or (2) remote only.
     */

    // local and remote
    let remoteMessage: string =
      'The branch also exists on the remote, ' +
      'do you wish to delete it there as well?'
    let showCheckBox: boolean = true

    // Remote only
    if (this.props.branch.type === BranchType.Remote) {
      remoteMessage =
        'This branch only exists on the remote, ' +
        'and does not exist locally.'
      showCheckBox = false
    }

    return (
      <div>
        <p>
          <strong>{remoteMessage}</strong>
        </p>
        {this.renderCheckBox(showCheckBox)}
      </div>
    )
  }

  private renderCheckBox(showCheckBox: boolean) {
    if (!showCheckBox) {
      return
    }

    return (
      <Checkbox
        label="Yes, delete this branch on the remote"
        value={
          this.state.includeRemoteBranch ? CheckboxValue.On : CheckboxValue.Off
        }
        onChange={this.onIncludeRemoteChanged}
      />
    )
  }

  private onIncludeRemoteChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = event.currentTarget.checked

    this.setState({ includeRemoteBranch: value })
  }

  private deleteBranch = async () => {
    const { dispatcher, repository, branch } = this.props

    this.setState({ isDeleting: true })

    await dispatcher.deleteBranch(
      repository,
      branch,
      this.state.includeRemoteBranch
    )
    this.props.onDeleted(repository)

    this.props.onDismissed()
  }
}
