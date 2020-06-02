import * as React from 'react'

import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'
import { Branch } from '../../models/branch'
import { sanitizedRefName } from '../../lib/sanitize-ref-name'
import { TextBox } from '../lib/text-box'
import { Row } from '../lib/row'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import {
  renderBranchNameWarning,
  renderBranchHasRemoteWarning,
  renderStashWillBeLostWarning,
} from '../lib/branch-name-warnings'
import { IStashEntry } from '../../models/stash-entry'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'

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
    const disabled =
      !this.state.newName.length || /^\s*$/.test(this.state.newName)
    return (
      <Dialog
        id="rename-branch"
        title={__DARWIN__ ? 'Rename Branch' : 'Rename branch'}
        onDismissed={this.props.onDismissed}
        onSubmit={this.renameBranch}
      >
        <DialogContent>
          <Row>
            <TextBox
              label="Name"
              value={this.state.newName}
              onValueChanged={this.onNameChange}
            />
          </Row>
          {renderBranchNameWarning(
            this.state.newName,
            sanitizedRefName(this.state.newName)
          )}
          {renderBranchHasRemoteWarning(this.props.branch)}
          {renderStashWillBeLostWarning(this.props.stash)}
        </DialogContent>

        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={`Rename ${this.props.branch.name}`}
            okButtonDisabled={disabled}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private onNameChange = (name: string) => {
    this.setState({ newName: name })
  }

  private renameBranch = () => {
    const name = sanitizedRefName(this.state.newName)
    this.props.dispatcher.renameBranch(
      this.props.repository,
      this.props.branch,
      name
    )
    this.props.onDismissed()
  }
}
