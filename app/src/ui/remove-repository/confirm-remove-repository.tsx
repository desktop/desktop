import * as React from 'react'
import { ButtonGroup } from '../lib/button-group'
import { Button } from '../lib/button'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Repository } from '../../models/repository'
import { TrashNameLabel } from '../lib/context-menu'

interface IConfirmRemoveRepositoryProps {
  /** The repository to be removed */
  readonly repository: Repository

  /** The action to execute when the user confirms */
  readonly onConfirmation: (repo: Repository) => void

  /** The action to execute when the user cancels */
  readonly onDismissed: () => void
}

interface IConfirmRemoveRepositoryState {
  readonly includeMoveToTrash: boolean
}

export class ConfirmRemoveRepository extends React.Component<
  IConfirmRemoveRepositoryProps,
  IConfirmRemoveRepositoryState
> {
  public constructor(props: IConfirmRemoveRepositoryProps) {
    super(props)

    this.state = {
      includeMoveToTrash: false,
    }
  }

  private cancel = () => {
    this.props.onDismissed()
  }

  private onConfirmed = () => {
    this.props.onConfirmation(this.props.repository)
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
            Are you sure you want to remove the repository "{
              this.props.repository.name
            }"?
          </p>
          <p className="description">
            The repository will be removed from GitHub Desktop.
          </p>

          <div>
            <p>
              <strong>
                Do you wish to move this repository to the {TrashNameLabel} as
                well?
              </strong>
            </p>
            <Checkbox
              label={'Yes, move this repository to ' + TrashNameLabel}
              value={
                this.state.includeMoveToTrash
                  ? CheckboxValue.On
                  : CheckboxValue.Off
              }
              onChange={this.onIncludeMoveToTrash}
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

  private onIncludeMoveToTrash = (event: React.FormEvent<HTMLInputElement>) => {
    const value = event.currentTarget.checked

    this.setState({ includeMoveToTrash: value })
  }
}
