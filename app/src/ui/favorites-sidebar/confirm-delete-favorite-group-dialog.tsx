import * as React from 'react'

import { Dialog, DialogContent, DialogError, DialogFooter } from '../dialog'
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

interface IConfirmDeleteFavoriteGroupDialogState {
  readonly submitting: boolean
  readonly submitError: string | null
}

/**
 * Confirmation prompt shown before deleting a favorites group. Member
 * repositories stay in the app but are no longer marked as favorites.
 */
export class ConfirmDeleteFavoriteGroupDialog extends React.Component<
  IConfirmDeleteFavoriteGroupDialogProps,
  IConfirmDeleteFavoriteGroupDialogState
> {
  public constructor(props: IConfirmDeleteFavoriteGroupDialogProps) {
    super(props)
    this.state = { submitting: false, submitError: null }
  }

  public render() {
    const { groupName, memberCount } = this.props
    const { submitting, submitError } = this.state
    return (
      <Dialog
        id="confirm-delete-favorite-group"
        title={__DARWIN__ ? 'Delete Favorites Group' : 'Delete favorites group'}
        type="warning"
        role="alertdialog"
        ariaDescribedBy="confirm-delete-favorite-group-message"
        onSubmit={this.onConfirm}
        onDismissed={this.props.onDismissed}
        disabled={submitting}
        loading={submitting}
      >
        {submitError && <DialogError>{submitError}</DialogError>}
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

  private onConfirm = async () => {
    if (this.state.submitting) {
      return
    }
    this.setState({ submitting: true, submitError: null })
    try {
      await this.props.dispatcher.removeFavoriteGroup(this.props.groupId)
    } catch (e) {
      this.setState({
        submitting: false,
        submitError:
          e instanceof Error
            ? e.message
            : 'Could not delete the favorites group.',
      })
      return
    }
    this.props.onDismissed()
  }
}
