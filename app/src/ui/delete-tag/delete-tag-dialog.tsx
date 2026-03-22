import * as React from 'react'

import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Ref } from '../lib/ref'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'

interface IDeleteTagProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly tagName: string
  readonly canDeleteRemote: boolean
  readonly onDismissed: () => void
}

interface IDeleteTagState {
  readonly isDeleting: boolean
  readonly removeFromRemote: boolean
}

export class DeleteTag extends React.Component<
  IDeleteTagProps,
  IDeleteTagState
> {
  public constructor(props: IDeleteTagProps) {
    super(props)

    this.state = {
      isDeleting: false,
      removeFromRemote: false,
    }
  }

  public render() {
    return (
      <Dialog
        id="delete-tag"
        title={__DARWIN__ ? 'Delete Tag' : 'Delete tag'}
        type="warning"
        onSubmit={this.DeleteTag}
        onDismissed={this.props.onDismissed}
        disabled={this.state.isDeleting}
        loading={this.state.isDeleting}
        role="alertdialog"
        ariaDescribedBy="delete-tag-confirmation"
      >
        <DialogContent>
          <p id="delete-tag-confirmation">
            Are you sure you want to delete the tag{' '}
            <Ref>{this.props.tagName}</Ref>?
          </p>
          {this.renderDeleteOnRemote()}
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup okButtonText="Delete" />
        </DialogFooter>
      </Dialog>
    )
  }

  private renderDeleteOnRemote() {
    if (!this.props.canDeleteRemote) {
      return null
    }

    return (
      <Checkbox
        label="Remove tag from remote"
        value={
          this.state.removeFromRemote ? CheckboxValue.On : CheckboxValue.Off
        }
        onChange={this.onRemoveFromRemoteChanged}
      />
    )
  }

  private onRemoveFromRemoteChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.setState({ removeFromRemote: event.currentTarget.checked })
  }

  private DeleteTag = async () => {
    const { dispatcher, repository, tagName } = this.props

    this.setState({ isDeleting: true })

    await dispatcher.deleteTag(repository, tagName, {
      removeFromRemote: this.state.removeFromRemote,
    })
    this.props.onDismissed()
  }
}
