import * as React from 'react'

import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Button } from '../lib/button'
import { TextBox } from '../lib/text-box'
import {
  IRepositoryFolder,
  normalizeFolderName,
} from './repository-folder-store'

interface ICreateRepositoryFolderDialogProps {
  readonly targetRepositoryName: string | null
  readonly nameExists: (name: string) => boolean
  readonly onCreate: (name: string) => void
  readonly onDismissed: () => void
}

interface ICreateRepositoryFolderDialogState {
  readonly name: string
}

export class CreateRepositoryFolderDialog extends React.Component<
  ICreateRepositoryFolderDialogProps,
  ICreateRepositoryFolderDialogState
> {
  public constructor(props: ICreateRepositoryFolderDialogProps) {
    super(props)

    this.state = {
      name: '',
    }
  }

  public render() {
    const folderName = normalizeFolderName(this.state.name)
    const duplicateName =
      folderName.length > 0 && this.props.nameExists(folderName)

    return (
      <Dialog
        id="create-repository-folder"
        title={
          __DARWIN__ ? 'Create Repository Folder' : 'Create repository folder'
        }
        ariaDescribedBy="create-repository-folder-description"
        onDismissed={this.props.onDismissed}
        onSubmit={this.onSubmit}
      >
        <DialogContent>
          <p id="create-repository-folder-description">
            {this.props.targetRepositoryName === null
              ? 'Create a repository folder to organize repositories in the sidebar.'
              : `Create a repository folder for "${this.props.targetRepositoryName}".`}
          </p>
          <p>
            <TextBox
              ariaLabel="Folder name"
              value={this.state.name}
              onValueChanged={this.onNameChanged}
            />
          </p>
          {duplicateName && (
            <p className="description">
              A repository folder with that name already exists.
            </p>
          )}
        </DialogContent>

        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={__DARWIN__ ? 'Create Folder' : 'Create folder'}
            okButtonDisabled={folderName.length === 0 || duplicateName}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private onNameChanged = (name: string) => {
    this.setState({ name })
  }

  private onSubmit = () => {
    const folderName = normalizeFolderName(this.state.name)
    if (folderName.length === 0) {
      return
    }

    this.props.onCreate(folderName)
    this.props.onDismissed()
  }
}

interface IManageRepositoryFoldersDialogProps {
  readonly folders: ReadonlyArray<IRepositoryFolder>
  readonly onDismissed: () => void
  readonly onSave: (folders: ReadonlyArray<IRepositoryFolder>) => void
}

interface IManageRepositoryFoldersDialogState {
  readonly folders: ReadonlyArray<IRepositoryFolder>
}

interface IRepositoryFolderRowProps {
  readonly folder: IRepositoryFolder
  readonly index: number
  readonly totalFolders: number
  readonly onFolderNameChanged: (folderId: string, name: string) => void
  readonly onMoveFolder: (folderId: string, offset: -1 | 1) => void
  readonly onRemoveFolder: (folderId: string) => void
}

class RepositoryFolderRow extends React.Component<IRepositoryFolderRowProps> {
  public render() {
    const { folder, index, totalFolders } = this.props

    return (
      <div className="manage-repository-folders-dialog-row">
        <TextBox
          ariaLabel={`Folder name ${index + 1}`}
          value={folder.name}
          onValueChanged={this.onValueChanged}
        />
        <Button
          type="button"
          size="small"
          onClick={this.onMoveUp}
          disabled={index === 0}
        >
          Up
        </Button>
        <Button
          type="button"
          size="small"
          onClick={this.onMoveDown}
          disabled={index === totalFolders - 1}
        >
          Down
        </Button>
        <Button type="button" size="small" onClick={this.onRemove}>
          Remove
        </Button>
      </div>
    )
  }

  private onValueChanged = (name: string) => {
    this.props.onFolderNameChanged(this.props.folder.id, name)
  }

  private onMoveUp = () => {
    this.props.onMoveFolder(this.props.folder.id, -1)
  }

  private onMoveDown = () => {
    this.props.onMoveFolder(this.props.folder.id, 1)
  }

  private onRemove = () => {
    this.props.onRemoveFolder(this.props.folder.id)
  }
}

export class ManageRepositoryFoldersDialog extends React.Component<
  IManageRepositoryFoldersDialogProps,
  IManageRepositoryFoldersDialogState
> {
  public constructor(props: IManageRepositoryFoldersDialogProps) {
    super(props)

    this.state = {
      folders: props.folders,
    }
  }

  public render() {
    const canSave = this.canSave()

    return (
      <Dialog
        id="manage-repository-folders"
        title={
          __DARWIN__ ? 'Manage Repository Folders' : 'Manage repository folders'
        }
        ariaDescribedBy="manage-repository-folders-description"
        onDismissed={this.props.onDismissed}
        onSubmit={this.onSubmit}
      >
        <DialogContent>
          <p id="manage-repository-folders-description">
            Rename, reorder, or remove repository folders used in the sidebar.
          </p>
          <div className="manage-repository-folders-dialog-list">
            {this.state.folders.length === 0 ? (
              <p className="description">
                No repository folders have been created yet.
              </p>
            ) : (
              this.state.folders.map((folder, index) => (
                <RepositoryFolderRow
                  key={folder.id}
                  folder={folder}
                  index={index}
                  totalFolders={this.state.folders.length}
                  onFolderNameChanged={this.onFolderNameChanged}
                  onMoveFolder={this.moveFolder}
                  onRemoveFolder={this.removeFolder}
                />
              ))
            )}
          </div>
        </DialogContent>

        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={__DARWIN__ ? 'Save Folders' : 'Save folders'}
            okButtonDisabled={!canSave}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private canSave() {
    const names = this.state.folders.map(folder =>
      normalizeFolderName(folder.name)
    )
    const uniqueNames = new Set(names.map(name => name.toLowerCase()))

    return (
      names.every(name => name.length > 0) && uniqueNames.size === names.length
    )
  }

  private onFolderNameChanged = (folderId: string, name: string) => {
    this.setState(state => ({
      folders: state.folders.map(folder =>
        folder.id === folderId ? { ...folder, name } : folder
      ),
    }))
  }

  private moveFolder = (folderId: string, offset: -1 | 1) => {
    this.setState(state => {
      const index = state.folders.findIndex(folder => folder.id === folderId)
      const nextIndex = index + offset

      if (index < 0 || nextIndex < 0 || nextIndex >= state.folders.length) {
        return null
      }

      const folders = [...state.folders]
      const [folder] = folders.splice(index, 1)
      folders.splice(nextIndex, 0, folder)

      return { folders }
    })
  }

  private removeFolder = (folderId: string) => {
    this.setState(state => ({
      folders: state.folders.filter(folder => folder.id !== folderId),
    }))
  }

  private onSubmit = () => {
    const folders = this.state.folders.map(folder => ({
      ...folder,
      name: normalizeFolderName(folder.name),
    }))

    this.props.onSave(folders)
    this.props.onDismissed()
  }
}
