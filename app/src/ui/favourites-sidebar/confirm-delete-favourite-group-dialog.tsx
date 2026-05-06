import * as React from 'react'

import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Ref } from '../lib/ref'
import { Dispatcher } from '../dispatcher'

interface IConfirmDeleteFavouriteGroupDialogProps {
  readonly dispatcher: Dispatcher
  readonly groupId: number
  readonly groupName: string
  readonly memberCount: number
  readonly onDismissed: () => void
}

/**
 * Confirmation prompt shown before deleting a favourites group. Member
 * repositories stay in the app but are no longer marked as favourites.
 */
export class ConfirmDeleteFavouriteGroupDialog extends React.Component<IConfirmDeleteFavouriteGroupDialogProps> {
  public render() {
    const { groupName, memberCount } = this.props
    return (
      <Dialog
        id="confirm-delete-favourite-group"
        title={
          __DARWIN__ ? 'Delete Favourites Group' : 'Delete favourites group'
        }
        type="warning"
        role="alertdialog"
        ariaDescribedBy="confirm-delete-favourite-group-message"
        onSubmit={this.onConfirm}
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>
          <p id="confirm-delete-favourite-group-message">
            Are you sure you want to delete <Ref>{groupName}</Ref>?{' '}
            {memberCount === 0
              ? 'The group is empty.'
              : `Its ${memberCount} ${
                  memberCount === 1 ? 'repository' : 'repositories'
                } will no longer be favourites.`}
          </p>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup destructive={true} okButtonText="Delete" />
        </DialogFooter>
      </Dialog>
    )
  }

  private onConfirm = () => {
    this.props.dispatcher.deleteFavouriteGroup(this.props.groupId)
    this.props.onDismissed()
  }
}
