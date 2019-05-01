import * as React from 'react'
import { join } from 'path'
import * as glob from 'glob'
import { basename } from 'path'
import { IFoundEditor } from '../../lib/editors/found-editor'
import { ExternalEditor, launchExternalEditor } from '../../lib/editors'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { SelectFromLocationList } from './select-from-location-list'

export interface ILocationList {
  /** The location name of the path to open the repository */
  locationName: string

  /** The path to open the repository */
  path: string
}

interface IOpenRepositoryInVSCodeProps {
  /** The external editor to launch */
  readonly editor: IFoundEditor<ExternalEditor>

  /** The repository path */
  readonly repositoryPath: string

  /** The action to execute when the user cancels */
  readonly onDismissed: () => void
}

interface IOpenRepositoryInVSCodeState {
  /** The path of selected location */
  readonly selectedLocationPath: string
}

export class OpenRepositoryInVSCode extends React.Component<
  IOpenRepositoryInVSCodeProps,
  IOpenRepositoryInVSCodeState
> {
  public constructor(props: IOpenRepositoryInVSCodeProps) {
    super(props)

    this.state = {
      selectedLocationPath: this.props.repositoryPath,
    }
  }

  private getLocationList = () => {
    const workspacePattern = join(this.props.repositoryPath, '*.code-workspace')
    const locationList: ILocationList[] = [
      {
        locationName: __DARWIN__
          ? 'The Repository Root Directory'
          : 'The repository root directry',
        path: this.props.repositoryPath,
      },
    ]

    glob.sync(workspacePattern).map(filePath => {
      locationList.push({
        locationName: basename(filePath),
        path: filePath,
      })
    })
    return locationList
  }

  private onSelectedLocationChanged = (location: string) => {
    this.setState({ selectedLocationPath: location })
  }

  private submit = async () => {
    await launchExternalEditor(this.props.repositoryPath, this.props.editor)
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
          <SelectFromLocationList
            locationList={this.getLocationList()}
            selectedLocationPath={this.state.selectedLocationPath}
            onChanged={this.onSelectedLocationChanged}
          />
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
