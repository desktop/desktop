import * as React from 'react'

import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Row } from '../lib/row'
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

export class FavoriteGroupNameDialog extends React.Component<IProps, IState> {
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
        ? 'Rename Favorites Group'
        : 'Rename favorites group'
      : __DARWIN__
      ? 'New Favorites Group'
      : 'New favorites group'
    const okText = isRename ? 'Rename' : 'Create'
    const description = isRename
      ? 'Choose a new name for this favorites group.'
      : 'Group your favorites under a name (e.g. Work, Personal).'

    return (
      <Dialog
        id="favorite-group-name-dialog"
        title={title}
        ariaDescribedBy="favorite-group-name-description"
        onDismissed={this.props.onDismissed}
        onSubmit={this.onSubmit}
      >
        <DialogContent>
          <p id="favorite-group-name-description">{description}</p>
          <Row>
            <TextBox
              ariaLabel="Group name"
              placeholder="e.g. Work, Personal, OSS"
              value={this.state.name}
              onValueChanged={this.onNameChanged}
            />
          </Row>
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
      await this.props.dispatcher.renameFavoriteGroup(
        this.props.groupId,
        trimmed
      )
    } else {
      const group = await this.props.dispatcher.addFavoriteGroup(trimmed)
      if (this.props.repository !== undefined) {
        await this.props.dispatcher.setRepositoryFavoriteGroup(
          this.props.repository,
          group.id
        )
      }
    }

    this.props.onDismissed()
  }
}
