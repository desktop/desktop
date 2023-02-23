import * as React from 'react'
import * as Path from 'path'
import { Dialog, DialogContent, DialogFooter, OkCancelButtonGroup } from '../dialog'
import { Dispatcher } from '../dispatcher'
import { Button } from '../lib/button'
import { Row } from '../lib/row'
import { TextBox } from '../lib/text-box'
import { showOpenDialog } from '../main-process-proxy'
import untildify from 'untildify'

interface IAddRepositoriesFromFolderProps {
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void
  readonly gitRepositoriesPath: string
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

    const path = this.props.gitRepositoriesPath ? this.props.gitRepositoriesPath : ''

    this.state = {
      path,
    }
  }

  public render() {
    return (
      <Dialog
        id="add-repositories-from-folder"
        title="Add Repositories from Folder"
        onSubmit={this.addRepositories}
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>
          <Row>
            <TextBox
              value={this.state.path}
              label={__DARWIN__ ? 'Git Repositories Path' : 'Git repositories path'}
              placeholder="Repositories path"
              onValueChanged={this.onPathChanged}
            />
            <Button onClick={this.showFilePicker}>Choose…</Button>
          </Row>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={__DARWIN__ ? 'Add Repositories' : 'Add repositories'}
            okButtonDisabled={false}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private showFilePicker = async () => {
    const path = await showOpenDialog({
      properties: ['createDirectory', 'openDirectory'],
    })

    if (path === null) {
      return
    }

    this.updatePath(path)
  }

  private updatePath = async (path: string) => {
    if (this.state.path !== path) {
      this.setState({ path })
    }
  }

  private onPathChanged = async (path: string) => {
    if (this.state.path !== path) {
      this.setState({ path })
    }
  }

  private resolvedPath(path: string): string {
    return Path.resolve('/', untildify(path))
  }

  private addRepositories = async () => {
    const { dispatcher } = this.props

    const resolvedPath = this.resolvedPath(this.state.path)



    const repositories = await dispatcher.addRepositories([resolvedPath])

    console.log('repositories', repositories)

    this.props.onDismissed()
  }
}
