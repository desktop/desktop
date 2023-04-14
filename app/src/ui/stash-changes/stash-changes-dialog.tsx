import * as React from 'react'

import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { WorkingDirectoryFileChange } from '../../models/status'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { PathText } from '../lib/path-text'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'

interface IStashChangesProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly files: ReadonlyArray<WorkingDirectoryFileChange>
  readonly confirmStashChanges: boolean
  /**
   * Determines whether to show the option
   * to ask for confirmation when stashing
   * changes
   */
  readonly stashingAllChanges: boolean
  readonly showStashChangesSetting: boolean
  readonly onDismissed: () => void
  readonly onConfirmStashChangesChanged: (optOut: boolean) => void
}

interface IStashChangesState {
  /**
   * Whether or not we're currently in the process of stashing
   * changes. This is used to display a loading state
   */
  readonly isStashingChanges: boolean

  readonly confirmStashChanges: boolean
}

/**
 * If we're stashing any more than this number, we won't bother listing them
 * all.
 */
const MaxFilesToList = 10

/** A component to confirm and then stash changes. */
export class StashChanges extends React.Component<
  IStashChangesProps,
  IStashChangesState
> {
  public constructor(props: IStashChangesProps) {
    super(props)

    this.state = {
      isStashingChanges: false,
      confirmStashChanges: this.props.confirmStashChanges,
    }
  }

  private getOkButtonLabel() {
    if (this.props.stashingAllChanges) {
      return __DARWIN__ ? 'Stash All Changes' : 'Stash all changes'
    }
    return __DARWIN__ ? 'Stash Changes' : 'Stash changes'
  }

  private getDialogTitle() {
    if (this.props.stashingAllChanges) {
      return __DARWIN__
        ? 'Confirm Stash All Changes'
        : 'Confirm stash all changes'
    }
    return __DARWIN__ ? 'Confirm Stash Changes' : 'Confirm stash changes'
  }

  public render() {
    const isStashingChanges = this.state.isStashingChanges

    return (
      <Dialog
        id="stash-changes"
        title={this.getDialogTitle()}
        onDismissed={this.props.onDismissed}
        onSubmit={this.stash}
        dismissable={isStashingChanges ? false : true}
        loading={isStashingChanges}
        disabled={isStashingChanges}
        type="warning"
      >
        <DialogContent>
          {this.renderFileList()}
          {this.renderConfirmStashChanges()}
        </DialogContent>

        <DialogFooter>
          <OkCancelButtonGroup
            destructive={true}
            okButtonText={this.getOkButtonLabel()}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private renderConfirmStashChanges() {
    if (this.props.showStashChangesSetting) {
      return (
        <Checkbox
          label="Do not show this message again"
          value={
            this.state.confirmStashChanges
              ? CheckboxValue.Off
              : CheckboxValue.On
          }
          onChange={this.onConfirmStashChangesChanged}
        />
      )
    } else {
      // since we ignore the users option to not show
      // confirmation, we don't want to show a checkbox
      // that will have no effect
      return null
    }
  }

  private renderFileList() {
    if (this.props.files.length > MaxFilesToList) {
      return (
        <p>
          Are you sure you want to stash all {this.props.files.length} changed
          files?
        </p>
      )
    } else {
      return (
        <div>
          <p>Are you sure you want to stash all changes to:</p>
          <div className="file-list">
            <ul>
              {this.props.files.map(p => (
                <li key={p.id}>
                  <PathText path={p.path} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      )
    }
  }

  private stash = async () => {
    this.setState({ isStashingChanges: true })

    await this.props.dispatcher.stashChanges(
      this.props.repository,
      this.props.files
    )

    this.props.onConfirmStashChangesChanged(this.state.confirmStashChanges)
    this.props.onDismissed()
  }

  private onConfirmStashChangesChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = !event.currentTarget.checked

    this.setState({ confirmStashChanges: value })
  }
}
