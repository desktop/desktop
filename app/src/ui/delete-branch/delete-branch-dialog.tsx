import * as React from 'react'

import { Dispatcher } from '../../lib/dispatcher'
import { Repository } from '../../models/repository'
import { Branch } from '../../models/branch'
import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Ref } from '../lib/ref'
import { IAheadBehind } from '../../lib/app-state'

interface IDeleteBranchProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly branch: Branch
  readonly existsOnRemote: boolean
  readonly aheadBehind: IAheadBehind | null
  readonly onDismissed: () => void
}

interface IDeleteBranchState {
  readonly includeRemoteBranch: boolean
}

export class DeleteBranch extends React.Component<
  IDeleteBranchProps,
  IDeleteBranchState
> {
  public constructor(props: IDeleteBranchProps) {
    super(props)

    this.state = {
      includeRemoteBranch: false,
    }
  }

  public render() {
    const aheadBehind = this.props.aheadBehind
    return aheadBehind !== null && aheadBehind.ahead > 0
      ? this.renderDeleteBranchWithUnmergedCommits()
      : this.renderDeleteBranch()
  }

  private renderDeleteBranchWithUnmergedCommits() {
    const unmergedCommits = this.props.aheadBehind!.ahead

    return (
      <Dialog
        id="delete-branch"
        title={__DARWIN__ ? 'Delete Branch' : 'Delete branch'}
        type="warning"
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>
          <p>
            <Ref>{this.props.branch.name}</Ref> has <em>{unmergedCommits}</em>{' '}
            unmerged {unmergedCommits === 1 ? 'commit' : 'commits'}.
            <br />
            Would you like to merge your changes first?
          </p>
        </DialogContent>
        <DialogFooter>
          <ButtonGroup destructive={true}>
            <Button type="submit">Cancel</Button>
            <Button onClick={this.deleteBranch}>No, Delete</Button>
            <Button onClick={this.mergeAndDelete}>Merge</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }

  private renderDeleteBranch() {
    return (
      <Dialog
        id="delete-branch"
        title={__DARWIN__ ? 'Delete Branch' : 'Delete branch'}
        type="warning"
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>
          <p>
            Delete branch <Ref>{this.props.branch.name}</Ref>?
            <br />
            This action cannot be undone.
          </p>

          {this.renderDeleteOnRemote()}
        </DialogContent>
        <DialogFooter>
          <ButtonGroup destructive={true}>
            <Button type="submit">Cancel</Button>
            <Button onClick={this.deleteBranch}>Delete</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }

  private renderDeleteOnRemote() {
    if (this.props.branch.remote && this.props.existsOnRemote) {
      return (
        <div>
          <p>
            <strong>
              The branch also exists on the remote, do you wish to delete it
              there as well?
            </strong>
          </p>
          {this.props.aheadBehind && this.props.aheadBehind.ahead > 0 ? (
            <p>Unmerged commits</p>
          ) : null}
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

  private deleteBranch = () => {
    this.props.dispatcher.deleteBranch(
      this.props.repository,
      this.props.branch,
      this.state.includeRemoteBranch
    )

    return this.props.dispatcher.closePopup()
  }

  private mergeAndDelete = async () => {
    await this.props.dispatcher.mergeBranch(
      this.props.repository,
      this.props.branch.name
    )

    this.deleteBranch()
  }
}
