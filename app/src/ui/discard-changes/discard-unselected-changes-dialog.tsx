import * as React from 'react'

import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { WorkingDirectoryFileChange } from '../../models/status'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { toPlatformCase } from '../../lib/platform-case'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'

interface IDiscardUnselectedLinesProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly file: WorkingDirectoryFileChange
  readonly confirmDiscardUnselectedChanges: boolean
  /**
   * Determines whether to show the option
   * to ask for confirmation when discarding
   * changes
   */
  readonly showDiscardChangesSetting: boolean
  readonly onDismissed: () => void
  readonly onConfirmDiscardUnselectedChangesChanged: (optOut: boolean) => void
}

interface IDiscardUnselectedLinesState {
  /**
   * Whether or not we're currently in the process of discarding
   * changes. This is used to display a loading state
   */
  readonly isDiscardingChanges: boolean

  readonly confirmDiscardUnselectedChanges: boolean
}

/** A component to confirm and then discard changes. */
export class DiscardUnselectedChanges extends React.Component<
  IDiscardUnselectedLinesProps,
  IDiscardUnselectedLinesState
> {
  public constructor(props: IDiscardUnselectedLinesProps) {
    super(props)

    this.state = {
      isDiscardingChanges: false,
      confirmDiscardUnselectedChanges: this.props
        .confirmDiscardUnselectedChanges,
    }
  }

  private getOkButtonLabel() {
    return __DARWIN__ ? 'Discard Unselected Lines' : 'Discard unselected lines'
  }

  public render() {
    const isDiscardingChanges = this.state.isDiscardingChanges

    return (
      <Dialog
        id="discard-changes"
        title={toPlatformCase('Confirm Discard Unselected Lines')}
        onDismissed={this.props.onDismissed}
        onSubmit={this.discard}
        dismissable={isDiscardingChanges ? false : true}
        loading={isDiscardingChanges}
        disabled={isDiscardingChanges}
        type="warning"
      >
        <DialogContent>
          {this.renderFileList()}
          <p className="alert">Discarded changes cannot be restored!!!</p>
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
            this.state.confirmDiscardUnselectedChanges
              ? CheckboxValue.Off
              : CheckboxValue.On
          }
          onChange={this.onConfirmDiscardUnselectedChangesChanged}
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
    return (
      <div>
        <p>Are you sure you want to discard all unselected changes to</p>
        <p>{this.props.file.path}</p>
      </div>
    )
  }

  private discard = async () => {
    this.setState({ isDiscardingChanges: true })

    await this.props.dispatcher.discardUnselectedChanges(
      this.props.repository,
      this.props.file
    )

    this.props.onConfirmDiscardUnselectedChangesChanged(
      this.state.confirmDiscardUnselectedChanges
    )
    this.props.onDismissed()
  }

  private onConfirmDiscardUnselectedChangesChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = !event.currentTarget.checked

    this.setState({ confirmDiscardUnselectedChanges: value })
  }
}
