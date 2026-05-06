import * as React from 'react'

import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Ref } from '../lib/ref'
import { Dispatcher } from '../dispatcher'

interface IConfirmDeleteFavoriteGroupDialogProps {
  readonly dispatcher: Dispatcher
  readonly groupId: number
  readonly groupName: string
  readonly memberCount: number
  readonly onDismissed: () => void
}

/**
 * Confirmation prompt shown before deleting a favorites group. Member
 * repositories stay in the app but are no longer marked as favorites.
 */
export class ConfirmDeleteFavoriteGroupDialog extends React.Component<IConfirmDeleteFavoriteGroupDialogProps> {
  public render() {
    const { groupName, memberCount } = this.props
    return (
      <Dialog
        id="confirm-delete-favorite-group"
        title={__DARWIN__ ? 'Delete Favorites Group' : 'Delete favorites group'}
        type="warning"
        role="alertdialog"
        ariaDescribedBy="confirm-delete-favorite-group-message"
        onSubmit={this.onConfirm}
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>
          <p id="confirm-delete-favorite-group-message">
            Are you sure you want to delete <Ref>{groupName}</Ref>?{' '}
            {memberCount === 0
              ? 'The group is empty.'
              : `Its ${memberCount} ${
                  memberCount === 1 ? 'repository' : 'repositories'
                } will no longer be favorites.`}
          </p>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup destructive={true} okButtonText="Delete" />
        </DialogFooter>
      </Dialog>
    )
  }

  private onConfirm = () => {
    this.props.dispatcher.removeFavoriteGroup(this.props.groupId)
    this.props.onDismissed()
  }
}
