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
  readonly pathIsValid: boolean
  readonly loading: boolean
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
      pathIsValid: this.validatePath(path),
      loading: false,
    }
  }

  public render() {
    return (
      <Dialog
        id="add-repositories-from-folder"
        title="Add Repositories from Folder"
        onSubmit={this.addRepositories}
        onDismissed={this.props.onDismissed}
        loading={this.state.loading}
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

          <p>
            If you have a folder with multiple Git repositories, you can add them all at once by
            choosing the folder here.
          </p>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={__DARWIN__ ? 'Add Repositories' : 'Add repositories'}
            okButtonDisabled={!this.state.pathIsValid}
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

  private validatePath(path: string): boolean {
    if (path === '') {
      return false
    }

    return true
  }

  private updatePath = async (path: string) => {
    const pathIsValid = this.validatePath(path)
    this.setState({ path, pathIsValid })
  }

  private onPathChanged = async (path: string) => {
    if (this.state.path !== path) {
      this.updatePath(path)
    }
  }

  private resolvedPath(path: string): string {
    return Path.resolve('/', untildify(path))
  }

  private addRepositories = async () => {
    this.setState({ loading: true })
    const { dispatcher } = this.props

    const resolvedPath = this.resolvedPath(this.state.path)
    await dispatcher.addRepositoriesFromPath(resolvedPath).catch(err => {
      this.setState({ loading: false })
      this.props.onDismissed()
    })

    this.setState({ loading: false })
    this.props.onDismissed()
  }
}
