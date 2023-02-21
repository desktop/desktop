import * as React from 'react'
import { Dialog, DialogContent } from '../dialog'
import { Dispatcher } from '../dispatcher'
import { TextBox } from '../lib/text-box'

interface IAddRepositoriesFromFolderProps {
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void
  readonly path?: string
}

interface IAddRepositoriesFromFolderState {
  readonly path: string
}

export class AddRepositoriesFromFolder extends React.Component<
  IAddRepositoriesFromFolderProps,
  IAddRepositoriesFromFolderState
> {
  public constructor(props: IAddRepositoriesFromFolderProps) {
    super(props)

    const path = this.props.path ? this.props.path : ''

    this.state = {
      path,
    }
  }

  public render() {
    return (
      <Dialog
        id="add-repositories-from-folder"
        title="Add Repositories from Folder"
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>
          <TextBox
            value={this.state.path}
            label="Path"
            placeholder="repository path"
            onValueChanged={this.onPathChanged}
          />
        </DialogContent>
      </Dialog>
    )
  }

  private onPathChanged = async (path: string) => {
    if (this.state.path !== path) {
      this.setState({ path })
    }
  }


}
