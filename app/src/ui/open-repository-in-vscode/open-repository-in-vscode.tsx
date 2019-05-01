import * as React from 'react'
import { IFoundEditor } from '../../lib/editors/found-editor'
import { ExternalEditor, launchVisualStudioCode } from '../../lib/editors'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Row } from '../../ui/lib/row'
// import { Select } from '../lib/select'
import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'

interface IOpenRepositoryInVSCodeProps {
  /** The external editor to launch */
  readonly editor: IFoundEditor<ExternalEditor>

  /** The repository path */
  readonly repositoryPath: string

  /** Whether we use workspase file when we launch Visual Studio Code */
  readonly useWorkspaceFile: boolean

  /** The action to execute when the user cancels */
  readonly onDismissed: () => void
}

export class OpenRepositoryInVSCode extends React.Component<
  IOpenRepositoryInVSCodeProps,
  {}
> {
  public constructor(props: IOpenRepositoryInVSCodeProps) {
    super(props)
  }

  private submit = async () => {
    await launchVisualStudioCode(
      this.props.editor,
      this.props.repositoryPath,
      this.props.useWorkspaceFile
    )

    this.props.onDismissed()
  }

  private cancel = () => {
    this.props.onDismissed()
  }

  public render() {
    return (
      <Dialog
        id="open-repository-in-vscode"
        type="normal"
        title={'Open the repository'}
        onSubmit={this.submit}
        onDismissed={this.cancel}
      >
        <DialogContent>
          <Row>Which location will you open?</Row>
        </DialogContent>
        <DialogFooter>
          <ButtonGroup destructive={true}>
            <Button type="submit">Open</Button>
            <Button onClick={this.cancel}>Cancel</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }
}
