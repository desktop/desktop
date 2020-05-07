import * as React from 'react'

import { WorkingDirectoryFileChange } from '../../models/status'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { PathText } from '../lib/path-text'
import { Monospaced } from '../lib/monospaced'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { TrashNameLabel } from '../lib/context-menu'
import { toPlatformCase } from '../../lib/platform-case'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { assertNever } from '../../lib/fatal-error'
import { Ref } from '../lib/ref'

export enum DiscardType {
  AllFiles, // When discarding all changes from all files in the current repository.
  SomeFiles, // When dicarding all changes from several files.
  Selection, // When discarding the selected changes from the opened file.
}

interface IDiscardChangesProps {
  readonly files: ReadonlyArray<WorkingDirectoryFileChange>
  readonly confirmDiscardChanges: boolean
  /**
   * Determines whether to show the option
   * to ask for confirmation when discarding
   * changes
   */
  readonly showDiscardChangesSetting: boolean
  readonly discardType: DiscardType
  readonly onDismissed: () => void
  readonly onSubmit: () => Promise<void>
  readonly onConfirmDiscardChangesChanged: (optOut: boolean) => void
}

interface IDiscardChangesState {
  /**
   * Whether or not we're currently in the process of discarding
   * changes. This is used to display a loading state
   */
  readonly isDiscardingChanges: boolean

  readonly confirmDiscardChanges: boolean
}

/**
 * If we're discarding any more than this number, we won't bother listing them
 * all.
 */
const MaxFilesToList = 10

/** A component to confirm and then discard changes. */
export class DiscardChanges extends React.Component<
  IDiscardChangesProps,
  IDiscardChangesState
> {
  public constructor(props: IDiscardChangesProps) {
    super(props)

    this.state = {
      isDiscardingChanges: false,
      confirmDiscardChanges: this.props.confirmDiscardChanges,
    }
  }

  private getOkButtonLabel() {
    switch (this.props.discardType) {
      case DiscardType.AllFiles:
        return toPlatformCase('Discard All Changes')
      case DiscardType.SomeFiles:
      case DiscardType.Selection:
        return toPlatformCase('Discard Changes')
      default:
        return assertNever(
          this.props.discardType,
          'Invalid discardType property'
        )
    }
  }

  private getDialogTitle() {
    switch (this.props.discardType) {
      case DiscardType.AllFiles:
        return toPlatformCase('Confirm Discard All Changes')
      case DiscardType.SomeFiles:
      case DiscardType.Selection:
        return toPlatformCase('Confirm Discard Changes')
      default:
        return assertNever(
          this.props.discardType,
          'Invalid discardType property'
        )
    }
  }

  public render() {
    const isDiscardingChanges = this.state.isDiscardingChanges

    return (
      <Dialog
        id="discard-changes"
        title={this.getDialogTitle()}
        onDismissed={this.props.onDismissed}
        onSubmit={this.discard}
        dismissable={isDiscardingChanges ? false : true}
        loading={isDiscardingChanges}
        disabled={isDiscardingChanges}
        type="warning"
      >
        <DialogContent>
          {this.renderFileList()}
          {this.renderAdditionalInfo()}
          {this.renderConfirmDiscardChanges()}
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

  private renderConfirmDiscardChanges() {
    if (this.props.showDiscardChangesSetting) {
      return (
        <Checkbox
          label="Do not show this message again"
          value={
            this.state.confirmDiscardChanges
              ? CheckboxValue.Off
              : CheckboxValue.On
          }
          onChange={this.onConfirmDiscardChangesChanged}
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
    if (this.props.discardType === DiscardType.Selection) {
      const fileName =
        this.props.files.length > 0 ? (
          <>
            {' '}
            from <Ref>{this.props.files[0].path}</Ref>
          </>
        ) : null

      return (
        <p>Are you sure you want to discard the selected lines {fileName}?</p>
      )
    }

    if (this.props.files.length > MaxFilesToList) {
      return (
        <p>
          Are you sure you want to discard all {this.props.files.length} changed
          files?
        </p>
      )
    } else {
      return (
        <div>
          <p>Are you sure you want to discard all changes to:</p>
          <ul>
            {this.props.files.map(p => (
              <li key={p.id}>
                <Monospaced>
                  <PathText path={p.path} />
                </Monospaced>
              </li>
            ))}
          </ul>
        </div>
      )
    }
  }

  private renderAdditionalInfo() {
    if (this.props.discardType === DiscardType.Selection) {
      // When discarding a selection we don't move the file to the trash.
      return null
    }

    return (
      <p>
        Changes can be restored by retrieving them from the {TrashNameLabel}.
      </p>
    )
  }

  private discard = async () => {
    this.setState({ isDiscardingChanges: true })

    await this.props.onSubmit()

    this.props.onConfirmDiscardChangesChanged(this.state.confirmDiscardChanges)
    this.props.onDismissed()
  }

  private onConfirmDiscardChangesChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = !event.currentTarget.checked

    this.setState({ confirmDiscardChanges: value })
  }
}
