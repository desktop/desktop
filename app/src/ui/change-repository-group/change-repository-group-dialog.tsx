import * as React from 'react'

import { Dispatcher } from '../dispatcher'
import { nameOf, Repository } from '../../models/repository'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { TextBox } from '../lib/text-box'

interface IChangeRepositoryGroupProps {
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void
  readonly repository: Repository
}

interface IChangeRepositoryGroupState {
  readonly groupName: string
}

/** A dialog for moving a repository into a new repository list group. */
export class ChangeRepositoryGroup extends React.Component<
  IChangeRepositoryGroupProps,
  IChangeRepositoryGroupState
> {
  public constructor(props: IChangeRepositoryGroupProps) {
    super(props)

    this.state = { groupName: '' }
  }

  public render() {
    return (
      <Dialog
        id="change-repository-group"
        title={__DARWIN__ ? 'New Group' : 'New group'}
        ariaDescribedBy="change-repository-group-description"
        onDismissed={this.props.onDismissed}
        onSubmit={this.changeGroup}
      >
        <DialogContent>
          <p id="change-repository-group-description">
            Create a group in the repository list and move "
            {nameOf(this.props.repository)}" into it.
          </p>
          <TextBox
            label="Group name"
            value={this.state.groupName}
            onValueChanged={this.onGroupNameChanged}
          />
        </DialogContent>

        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={__DARWIN__ ? 'Create and Move' : 'Create and move'}
            okButtonDisabled={this.state.groupName.trim().length === 0}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private onGroupNameChanged = (groupName: string) => {
    this.setState({ groupName })
  }

  private changeGroup = () => {
    this.props.dispatcher.changeRepositoryGroup(
      this.props.repository,
      this.state.groupName
    )
    this.props.onDismissed()
  }
}
