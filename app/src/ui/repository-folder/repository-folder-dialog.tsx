// Created by Pablo Urena Simon.

import * as React from 'react'

import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { TextBox } from '../lib/text-box'

interface IRepositoryFolderDialogProps {
  readonly initialName?: string
  readonly existingNames: ReadonlyArray<string>
  readonly repositoryName?: string
  readonly onSubmit: (name: string) => void
  readonly onDismissed: () => void
}

interface IRepositoryFolderDialogState {
  readonly name: string
}

export class RepositoryFolderDialog extends React.Component<
  IRepositoryFolderDialogProps,
  IRepositoryFolderDialogState
> {
  public constructor(props: IRepositoryFolderDialogProps) {
    super(props)
    this.state = { name: props.initialName ?? '' }
  }

  private get isDuplicate() {
    const name = this.state.name.trim().toLowerCase()
    const initialName = this.props.initialName?.trim().toLowerCase()

    return this.props.existingNames.some(
      existingName =>
        existingName.toLowerCase() === name &&
        existingName.toLowerCase() !== initialName
    )
  }

  private get canSubmit() {
    const name = this.state.name.trim()
    return (
      name.length > 0 && !this.isDuplicate && name !== this.props.initialName
    )
  }

  public render() {
    const isRenaming = this.props.initialName !== undefined
    const title = isRenaming
      ? __DARWIN__
        ? 'Rename Repository Folder'
        : 'Rename repository folder'
      : __DARWIN__
      ? 'New Repository Folder'
      : 'New repository folder'
    const action = isRenaming
      ? __DARWIN__
        ? 'Rename Folder'
        : 'Rename folder'
      : __DARWIN__
      ? 'Create Folder'
      : 'Create folder'
    return (
      <Dialog
        id="repository-folder"
        title={title}
        ariaDescribedBy="repository-folder-description"
        onDismissed={this.props.onDismissed}
        onSubmit={this.submit}
      >
        <DialogContent>
          <p id="repository-folder-description">
            {this.props.repositoryName === undefined
              ? 'Organize repositories in a local folder.'
              : `Create a folder and move "${this.props.repositoryName}" into it.`}
          </p>
          <p>
            <TextBox
              ariaLabel="Folder name"
              value={this.state.name}
              onValueChanged={this.onNameChanged}
            />
          </p>
          {this.isDuplicate && (
            <p className="description">
              A folder with this name already exists.
            </p>
          )}
          <p className="description">
            This only changes the organization in TreeGit.
          </p>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={action}
            okButtonDisabled={!this.canSubmit}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private onNameChanged = (name: string) => {
    this.setState({ name })
  }

  private submit = () => {
    if (!this.canSubmit) {
      return
    }

    this.props.onSubmit(this.state.name.trim())
    this.props.onDismissed()
  }
}
