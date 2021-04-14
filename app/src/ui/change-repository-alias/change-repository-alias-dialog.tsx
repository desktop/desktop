import * as React from 'react'

import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { TextBox } from '../lib/text-box'

interface IChangeRepositoryAliasProps {
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void
  readonly repository: Repository
}

interface IChangeRepositoryAliasState {
  readonly newAlias: string
}

export class ChangeRepositoryAlias extends React.Component<
  IChangeRepositoryAliasProps,
  IChangeRepositoryAliasState
> {
  public constructor(props: IChangeRepositoryAliasProps) {
    super(props)

    this.state = { newAlias: props.repository.alias ?? props.repository.name }
  }

  public render() {
    const verb = this.props.repository.alias === null ? 'Create' : 'Change'

    return (
      <Dialog
        id="rename-branch"
        title={
          __DARWIN__ ? `${verb} Repository Alias` : `${verb} repository alias`
        }
        onDismissed={this.props.onDismissed}
        onSubmit={this.changeAlias}
      >
        <DialogContent>
          <TextBox
            label="Name"
            value={this.state.newAlias}
            onValueChanged={this.onNameChanged}
          />
        </DialogContent>

        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={__DARWIN__ ? `${verb} Alias` : `${verb} alias`}
            okButtonDisabled={this.state.newAlias.length === 0}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private onNameChanged = (newAlias: string) => {
    this.setState({ newAlias })
  }

  private changeAlias = () => {
    this.props.dispatcher.changeRepositoryAlias(
      this.props.repository,
      this.state.newAlias
    )
    this.props.onDismissed()
  }
}
