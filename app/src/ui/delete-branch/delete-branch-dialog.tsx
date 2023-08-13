import * as React from 'react'

import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'
import { Branch } from '../../models/branch'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Ref } from '../lib/ref'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { getAheadBehind, revSymmetricDifference } from '../../lib/git'

interface IDeleteBranchProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly branch: Branch
  readonly defaultBranch: Branch | null
  readonly onDismissed: () => void
  readonly onDeleted: (repository: Repository) => void
}

interface IDeleteBranchState {
  readonly includeRemoteBranch: boolean
  readonly isDeleting: boolean
  readonly localUnmergedCommits: number
  readonly unpushedCommits: number
  readonly remoteUnmergedCommits: number
  readonly existsOnRemote: boolean
}

export class DeleteBranch extends React.Component<
  IDeleteBranchProps,
  IDeleteBranchState
> {
  public constructor(props: IDeleteBranchProps) {
    super(props)

    this.state = {
      includeRemoteBranch: false,
      isDeleting: false,
      localUnmergedCommits: 0,
      unpushedCommits: 0,
      remoteUnmergedCommits: 0,
      existsOnRemote: true,
    }
  }

  public componentDidMount() {
    this.checkAheadBehind()
  }

  private checkAheadBehind = async () => {
    const { branch, defaultBranch, repository } = this.props

    if (!branch?.upstream) {
      let localAheadBehind = null

      if (defaultBranch?.name) {
        localAheadBehind = await getAheadBehind(
          repository,
          revSymmetricDifference(branch.name, defaultBranch.name)
        )
      }

      this.setState({
        existsOnRemote: false,
        localUnmergedCommits: localAheadBehind?.ahead || 0,
      })
    } else {
      const pushAheadBehind = await getAheadBehind(
        repository,
        revSymmetricDifference(branch.name, branch.upstream)
      )

      let remoteAheadBehind = null
      if (defaultBranch?.upstream) {
        remoteAheadBehind = await getAheadBehind(
          repository,
          revSymmetricDifference(branch.upstream, defaultBranch.upstream)
        )
      }

      this.setState({
        existsOnRemote: true,
        unpushedCommits: pushAheadBehind?.ahead || 0,
        remoteUnmergedCommits: remoteAheadBehind?.ahead || 0,
      })
    }
  }

  public render() {
    return (
      <Dialog
        id="delete-branch"
        title={__DARWIN__ ? 'Delete Branch' : 'Delete branch'}
        type="warning"
        onSubmit={this.deleteBranch}
        onDismissed={this.props.onDismissed}
        disabled={this.state.isDeleting}
        loading={this.state.isDeleting}
        role="alertdialog"
        ariaDescribedBy="delete-branch-confirmation-message delete-branch-confirmation-message-remote"
      >
        <DialogContent>
          <p id="delete-branch-confirmation-message">
            Delete branch <Ref>{this.props.branch.name}</Ref>?<br />
            This action cannot be undone.
          </p>
          {this.renderLocalUnmergedWarning(this.state.localUnmergedCommits)}
          {this.renderUnpushedCommitsWarning(this.state.unpushedCommits)}
          {this.renderRemoteUnmergedCommitsWarning(
            this.state.remoteUnmergedCommits
          )}
          <br />
          {this.renderDeleteOnRemote()}
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup destructive={true} okButtonText="Delete" />
        </DialogFooter>
      </Dialog>
    )
  }

  private renderLocalUnmergedWarning(unmergedCommits: number) {
    if (this.state.existsOnRemote || this.state.localUnmergedCommits <= 0) {
      return null
    }

    return (
      <div>
        <strong>
          Warning: This branch has {unmergedCommits} unmerged{' '}
          {unmergedCommits === 1 ? 'commit' : 'commits'}.
        </strong>
      </div>
    )
  }

  private renderUnpushedCommitsWarning(unpushedCommits: number) {
    if (unpushedCommits <= 0) {
      return null
    }

    return (
      <div>
        <strong>
          Warning: This branch has {unpushedCommits} unpushed{' '}
          {unpushedCommits === 1 ? 'commit' : 'commits'}.
        </strong>
      </div>
    )
  }

  private renderRemoteUnmergedCommitsWarning(unmergedCommits: number) {
    if (unmergedCommits <= 0) {
      return null
    }

    return (
      <div>
        <strong>
          Warning: <Ref>{this.props.branch.upstream}</Ref> has {unmergedCommits}{' '}
          unmerged {unmergedCommits === 1 ? 'commit' : 'commits'}.
        </strong>
      </div>
    )
  }

  private renderDeleteOnRemote() {
    if (this.props.branch.upstreamRemoteName && this.state.existsOnRemote) {
      return (
        <div>
          <p>
            This branch also exists on the remote (
            <Ref>{this.props.branch.upstream}</Ref>).
            <br />
            Do you wish to delete it there as well?
          </p>
          <Checkbox
            label="Yes, delete this branch on the remote"
            value={
              this.state.includeRemoteBranch
                ? CheckboxValue.On
                : CheckboxValue.Off
            }
            onChange={this.onIncludeRemoteChanged}
          />
        </div>
      )
    }

    return null
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

    await dispatcher.deleteLocalBranch(
      repository,
      branch,
      this.state.includeRemoteBranch
    )
    this.props.onDeleted(repository)

    this.props.onDismissed()
  }
}
