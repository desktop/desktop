import * as React from 'react'

import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'
import { Branch } from '../../models/branch'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import {
  renderBranchHasRemoteWarning,
  renderStashWillBeLostWarning,
} from '../lib/branch-name-warnings'
import { IStashEntry } from '../../models/stash-entry'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { RefNameTextBox } from '../lib/ref-name-text-box'

interface IRenameBranchProps {
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void
  readonly repository: Repository
  readonly branch: Branch
  readonly stash: IStashEntry | null
}

interface IRenameBranchState {
  readonly newName: string
}

export class RenameBranch extends React.Component<
  IRenameBranchProps,
  IRenameBranchState
> {
  public constructor(props: IRenameBranchProps) {
    super(props)

    this.state = { newName: props.branch.name }
  }

  public render() {
    return (
      <Dialog
        id="rename-branch"
        title={__DARWIN__ ? 'Rename Branch' : 'Rename branch'}
        onDismissed={this.props.onDismissed}
        onSubmit={this.renameBranch}
      >
        <DialogContent>
          <RefNameTextBox
            label="Name"
            initialValue={this.props.branch.name}
            onValueChange={this.onNameChange}
          />
          {renderBranchHasRemoteWarning(this.props.branch)}
          {renderStashWillBeLostWarning(this.props.stash)}
        </DialogContent>

        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={`Rename ${this.props.branch.name}`}
            okButtonDisabled={this.state.newName.length === 0}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private onNameChange = (name: string) => {
    this.setState({ newName: name })
  }

  private renameBranch = () => {
    this.props.dispatcher.renameBranch(
      this.props.repository,
      this.props.branch,
      this.state.newName
    )
    this.props.onDismissed()
  }
}
