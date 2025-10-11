import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  OkCancelButtonGroup,
} from '../dialog'
import { TextArea } from '../lib/text-area'
import { Dispatcher } from '../dispatcher'

interface IGAddParentDirectoriesProps {
  /**
   * Callback to use when the dialog gets closed.
   */
  readonly onValueChanged: (text: string) => void
  readonly text: string | null
  readonly onDismissed: () => void
  readonly dispatcher: Dispatcher
}

export class AddParentDirectoriesPopup extends React.Component<IGAddParentDirectoriesProps> {
  public constructor(props: IGAddParentDirectoriesProps) {
    super(props)
  }

  public render() {
    return (
      <Dialog
        title="Parent Directories"
        id="add-parent-directories-popup"
        onDismissed={this.props.onDismissed}
        onSubmit={this.onSubmit}
        ariaDescribedBy="add-parent-directories-popup-body"
        role="alertdialog"
      >
        <DialogContent>
          <div id="add-parent-directories-description">
            <p>
              When searching for a repository via its ID, the application will look through all directories within each parent directory. If no parent directory is added, then the application cannot search for the repository.
            </p>
            <p>
              Input the paths to the parent directories you want to add, one per line:
            </p>
          </div>
          <div>
            <TextArea
              ariaLabel="Parent directories"
              ariaDescribedBy="add-parent-directories-description"
              placeholder={this.getPlaceholderText()}
              value={this.props.text || ''}
              onValueChanged={this.props.onValueChanged}
              textareaClassName="gitignore"
            />
          </div>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup destructive={true} okButtonText="Save" />
        </DialogFooter>
      </Dialog>
    )
  }

  private getPlaceholderText = (): string => {
    return '/my/repos\n/another/parent/directory'
  }

  private onSubmit = async () => {
    const { dispatcher } = this.props

    dispatcher.setParentDirectories(this.props.text || '')

    this.props.onDismissed()
  }
}
