import * as React from 'react'
import * as Path from 'path'

import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { TextBox } from '../lib/text-box'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'

interface IRenameWorktreeDialogProps {
  readonly repository: Repository
  readonly worktreePath: string
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void
}

interface IRenameWorktreeDialogState {
  readonly newName: string
  readonly renaming: boolean
}

export class RenameWorktreeDialog extends React.Component<
  IRenameWorktreeDialogProps,
  IRenameWorktreeDialogState
> {
  public constructor(props: IRenameWorktreeDialogProps) {
    super(props)

    this.state = {
      newName: Path.basename(props.worktreePath),
      renaming: false,
    }
  }

  private onNameChanged = (newName: string) => {
    this.setState({ newName })
  }

  private onSubmit = async () => {
    const { worktreePath, repository, onDismissed } = this.props
    const { newName } = this.state
    const newPath = Path.join(Path.dirname(worktreePath), newName)

    this.setState({ renaming: true })

    const success = await this.props.dispatcher.moveWorktree(
      repository,
      worktreePath,
      newPath
    )

    this.setState({ renaming: false })

    if (success) {
      onDismissed()
    }
  }

  public render() {
    const currentName = Path.basename(this.props.worktreePath)
    const disabled =
      this.state.newName.length === 0 ||
      this.state.newName === currentName ||
      this.state.renaming

    return (
      <Dialog
        id="rename-worktree"
        title={__DARWIN__ ? 'Rename Worktree' : 'Rename worktree'}
        loading={this.state.renaming}
        onSubmit={this.onSubmit}
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>
          <TextBox
            label="Name"
            value={this.state.newName}
            onValueChanged={this.onNameChanged}
          />
        </DialogContent>

        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={`Rename ${currentName}`}
            okButtonDisabled={disabled}
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
