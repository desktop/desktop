import * as React from 'react'
import { ButtonGroup } from '../lib/button-group'
import { Button } from '../lib/button'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Ref } from '../lib/ref'
import { Repository } from '../../models/repository'
import { TrashNameLabel } from '../lib/context-menu'

interface IConfirmRemoveRepositoryProps {
  /** The repository to be removed */
  readonly repository: Repository

  /** The action to execute when the user confirms */
  readonly onConfirmation: (
    repo: Repository,
    deleteRepoFromDisk: boolean
  ) => void

  /** The action to execute when the user cancels */
  readonly onDismissed: () => void
}

interface IConfirmRemoveRepositoryState {
  readonly deleteRepoFromDisk: boolean
}

export class ConfirmRemoveRepository extends React.Component<
  IConfirmRemoveRepositoryProps,
  IConfirmRemoveRepositoryState
> {
  public constructor(props: IConfirmRemoveRepositoryProps) {
    super(props)

    this.state = {
      deleteRepoFromDisk: false,
    }
  }

  private cancel = () => {
    this.props.onDismissed()
  }

  private onConfirmed = () => {
    this.props.onConfirmation(
      this.props.repository,
      this.state.deleteRepoFromDisk
    )

    this.props.onDismissed()
  }

  public render() {
    return (
      <Dialog
        id="confirm-remove-repository"
        key="remove-repository-confirmation"
        type="warning"
        title={__DARWIN__ ? 'Remove Repository' : 'Remove repository'}
        onDismissed={this.cancel}
        onSubmit={this.cancel}
      >
        <DialogContent>
          <p>
            Are you sure you want to remove the repository "
            {this.props.repository.name}
            "?
          </p>
          <p className="description">
            The repository will be removed from GitHub Desktop:
            <br />
            <Ref>{this.props.repository.path}</Ref>
          </p>

          <div>
            <Checkbox
              label={'Also move this repository to ' + TrashNameLabel}
              value={
                this.state.deleteRepoFromDisk
                  ? CheckboxValue.On
                  : CheckboxValue.Off
              }
              onChange={this.onConfirmRepositoryDeletion}
            />
          </div>
        </DialogContent>
        <DialogFooter>
          <ButtonGroup destructive={true}>
            <Button type="submit">Cancel</Button>
            <Button onClick={this.onConfirmed}>Remove</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }

  private onConfirmRepositoryDeletion = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = event.currentTarget.checked

    this.setState({ deleteRepoFromDisk: value })
  }
}
