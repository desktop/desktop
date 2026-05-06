import * as React from 'react'

import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { TextBox } from '../lib/text-box'

type IProps =
  | {
      readonly dispatcher: Dispatcher
      readonly onDismissed: () => void
      readonly mode: 'create'
      readonly repository?: Repository
    }
  | {
      readonly dispatcher: Dispatcher
      readonly onDismissed: () => void
      readonly mode: 'rename'
      readonly groupId: number
      readonly currentName: string
    }

interface IState {
  readonly name: string
}

export class FavouriteGroupNameDialog extends React.Component<IProps, IState> {
  public constructor(props: IProps) {
    super(props)
    this.state = {
      name: props.mode === 'rename' ? props.currentName : '',
    }
  }

  public render() {
    const isRename = this.props.mode === 'rename'
    const title = isRename
      ? __DARWIN__
        ? 'Rename Favourites Group'
        : 'Rename favourites group'
      : __DARWIN__
      ? 'New Favourites Group'
      : 'New favourites group'
    const okText = isRename
      ? __DARWIN__
        ? 'Rename'
        : 'Rename'
      : __DARWIN__
      ? 'Create'
      : 'Create'

    return (
      <Dialog
        id="favourite-group-name-dialog"
        title={title}
        onDismissed={this.props.onDismissed}
        onSubmit={this.onSubmit}
      >
        <DialogContent>
          <p>
            <TextBox
              ariaLabel="Group name"
              placeholder="e.g. Work, Personal, OSS"
              value={this.state.name}
              onValueChanged={this.onNameChanged}
            />
          </p>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={okText}
            okButtonDisabled={this.state.name.trim().length === 0}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private onNameChanged = (name: string) => this.setState({ name })

  private onSubmit = async () => {
    const trimmed = this.state.name.trim()
    if (trimmed.length === 0) {
      return
    }

    if (this.props.mode === 'rename') {
      await this.props.dispatcher.renameFavouriteGroup(
        this.props.groupId,
        trimmed
      )
    } else {
      const group = await this.props.dispatcher.addFavouriteGroup(trimmed)
      if (this.props.repository !== undefined) {
        await this.props.dispatcher.setRepositoryFavouriteGroup(
          this.props.repository,
          group.id
        )
      }
    }

    this.props.onDismissed()
  }
}
