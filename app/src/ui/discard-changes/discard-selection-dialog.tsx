import * as React from 'react'

import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { WorkingDirectoryFileChange } from '../../models/status'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { PathText } from '../lib/path-text'
import { Monospaced } from '../lib/monospaced'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { ITextDiff, DiffSelection } from '../../models/diff'

interface IDiscardSelectionProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly file: WorkingDirectoryFileChange
  readonly diff: ITextDiff
  readonly selection: DiffSelection
  readonly confirmDiscardSelection: boolean
  readonly showDiscardSelectionSetting: boolean
  readonly onDismissed: () => void
  readonly onConfirmDiscardSelectionChanged: (optOut: boolean) => void
}

interface IDiscardSelectionState {
  /**
   * Whether or not we're currently in the process of discarding
   * changes. This is used to display a loading state
   */
  readonly isDiscardingSelection: boolean

  readonly confirmDiscardSelection: boolean
}

/** A component to confirm and then discard changes. */
export class DiscardSelection extends React.Component<
  IDiscardSelectionProps,
  IDiscardSelectionState
> {
  public constructor(props: IDiscardSelectionProps) {
    super(props)

    this.state = {
      isDiscardingSelection: false,
      confirmDiscardSelection: this.props.confirmDiscardSelection,
    }
  }

  private getOkButtonLabel() {
    return __DARWIN__ ? 'Discard changes' : 'Discard changes'
  }

  public render() {
    const isDiscardingChanges = this.state.isDiscardingSelection

    return (
      <Dialog
        id="discard-changes"
        title={
          __DARWIN__ ? 'Confirm Discard changes' : 'Confirm Discard changes'
        }
        onDismissed={this.props.onDismissed}
        onSubmit={this.discard}
        dismissable={isDiscardingChanges ? false : true}
        loading={isDiscardingChanges}
        disabled={isDiscardingChanges}
        type="warning"
      >
        <DialogContent>
          <p>
            Are you sure you want to discard the selected changes to
            <Monospaced>
              <PathText path={this.props.file.path} />
            </Monospaced>
          </p>

          {this.renderConfirmDiscardSelection()}
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

  private renderConfirmDiscardSelection() {
    if (this.props.showDiscardSelectionSetting) {
      return (
        <Checkbox
          label="Do not show this message again"
          value={
            this.state.confirmDiscardSelection
              ? CheckboxValue.Off
              : CheckboxValue.On
          }
          onChange={this.onConfirmDiscardSelectionChanged}
        />
      )
    } else {
      // since we ignore the users option to not show
      // confirmation, we don't want to show a checkbox
      // that will have no effect
      return null
    }
  }

  private discard = async () => {
    this.setState({ isDiscardingSelection: true })

    await this.props.dispatcher.discardChangesFromSelection(
      this.props.repository,
      this.props.file.path,
      this.props.diff,
      this.props.selection
    )

    this.props.onConfirmDiscardSelectionChanged(
      this.state.confirmDiscardSelection
    )
    this.props.onDismissed()
  }

  private onConfirmDiscardSelectionChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = !event.currentTarget.checked

    this.setState({ confirmDiscardSelection: value })
  }
}
