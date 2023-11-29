import * as React from 'react'
import { UncommittedChangesStrategy } from '../../models/uncommitted-changes-strategy'
import { DialogContent } from '../dialog'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { RadioGroup } from '../lib/radio-group'
import { assertNever } from '../../lib/fatal-error'

interface IPromptsPreferencesProps {
  readonly confirmRepositoryRemoval: boolean
  readonly confirmDiscardChanges: boolean
  readonly confirmDiscardChangesPermanently: boolean
  readonly confirmDiscardStash: boolean
  readonly confirmCheckoutCommit: boolean
  readonly confirmForcePush: boolean
  readonly confirmUndoCommit: boolean
  readonly showCommitLengthWarning: boolean
  readonly uncommittedChangesStrategy: UncommittedChangesStrategy
  readonly onConfirmDiscardChangesChanged: (checked: boolean) => void
  readonly onConfirmDiscardChangesPermanentlyChanged: (checked: boolean) => void
  readonly onConfirmDiscardStashChanged: (checked: boolean) => void
  readonly onConfirmCheckoutCommitChanged: (checked: boolean) => void
  readonly onConfirmRepositoryRemovalChanged: (checked: boolean) => void
  readonly onConfirmForcePushChanged: (checked: boolean) => void
  readonly onConfirmUndoCommitChanged: (checked: boolean) => void
  readonly onShowCommitLengthWarningChanged: (checked: boolean) => void
  readonly onUncommittedChangesStrategyChanged: (
    value: UncommittedChangesStrategy
  ) => void
}

interface IPromptsPreferencesState {
  readonly confirmRepositoryRemoval: boolean
  readonly confirmDiscardChanges: boolean
  readonly confirmDiscardChangesPermanently: boolean
  readonly confirmDiscardStash: boolean
  readonly confirmCheckoutCommit: boolean
  readonly confirmForcePush: boolean
  readonly confirmUndoCommit: boolean
  readonly uncommittedChangesStrategy: UncommittedChangesStrategy
}

export class Prompts extends React.Component<
  IPromptsPreferencesProps,
  IPromptsPreferencesState
> {
  public constructor(props: IPromptsPreferencesProps) {
    super(props)

    this.state = {
      confirmRepositoryRemoval: this.props.confirmRepositoryRemoval,
      confirmDiscardChanges: this.props.confirmDiscardChanges,
      confirmDiscardChangesPermanently:
        this.props.confirmDiscardChangesPermanently,
      confirmDiscardStash: this.props.confirmDiscardStash,
      confirmCheckoutCommit: this.props.confirmCheckoutCommit,
      confirmForcePush: this.props.confirmForcePush,
      confirmUndoCommit: this.props.confirmUndoCommit,
      uncommittedChangesStrategy: this.props.uncommittedChangesStrategy,
    }
  }

  private onConfirmDiscardChangesChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = event.currentTarget.checked

    this.setState({ confirmDiscardChanges: value })
    this.props.onConfirmDiscardChangesChanged(value)
  }

  private onConfirmDiscardChangesPermanentlyChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = event.currentTarget.checked

    this.setState({ confirmDiscardChangesPermanently: value })
    this.props.onConfirmDiscardChangesPermanentlyChanged(value)
  }

  private onConfirmDiscardStashChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = event.currentTarget.checked

    this.setState({ confirmDiscardStash: value })
    this.props.onConfirmDiscardStashChanged(value)
  }

  private onConfirmCheckoutCommitChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = event.currentTarget.checked

    this.setState({ confirmCheckoutCommit: value })
    this.props.onConfirmCheckoutCommitChanged(value)
  }

  private onConfirmForcePushChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = event.currentTarget.checked

    this.setState({ confirmForcePush: value })
    this.props.onConfirmForcePushChanged(value)
  }

  private onConfirmUndoCommitChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = event.currentTarget.checked

    this.setState({ confirmUndoCommit: value })
    this.props.onConfirmUndoCommitChanged(value)
  }

  private onConfirmRepositoryRemovalChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = event.currentTarget.checked

    this.setState({ confirmRepositoryRemoval: value })
    this.props.onConfirmRepositoryRemovalChanged(value)
  }

  private onUncommittedChangesStrategyChanged = (
    value: UncommittedChangesStrategy
  ) => {
    this.setState({ uncommittedChangesStrategy: value })
    this.props.onUncommittedChangesStrategyChanged(value)
  }

  private onShowCommitLengthWarningChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.props.onShowCommitLengthWarningChanged(event.currentTarget.checked)
  }

  private renderSwitchBranchOptionLabel = (key: UncommittedChangesStrategy) => {
    switch (key) {
      case UncommittedChangesStrategy.AskForConfirmation:
        return 'Ask me where I want the changes to go'
      case UncommittedChangesStrategy.MoveToNewBranch:
        return 'Always bring my changes to my new branch'
      case UncommittedChangesStrategy.StashOnCurrentBranch:
        return 'Always stash and leave my changes on the current branch'
      default:
        return assertNever(key, `Unknown uncommitted changes strategy: ${key}`)
    }
  }

  private renderSwitchBranchOptions = () => {
    const options = [
      UncommittedChangesStrategy.AskForConfirmation,
      UncommittedChangesStrategy.MoveToNewBranch,
      UncommittedChangesStrategy.StashOnCurrentBranch,
    ]

    const selectedKey =
      options.find(o => o === this.state.uncommittedChangesStrategy) ??
      UncommittedChangesStrategy.AskForConfirmation

    return (
      <div className="advanced-section">
        <h2 id="switch-branch-heading">
          If I have changes and I switch branches...
        </h2>

        <RadioGroup<UncommittedChangesStrategy>
          ariaLabelledBy="switch-branch-heading"
          selectedKey={selectedKey}
          radioButtonKeys={options}
          onSelectionChanged={this.onUncommittedChangesStrategyChanged}
          renderRadioButtonLabelContents={this.renderSwitchBranchOptionLabel}
        />
      </div>
    )
  }

  public render() {
    return (
      <DialogContent>
        <div className="advanced-section">
          <h2 id="show-confirm-dialog-heading">
            Show a confirmation dialog before...
          </h2>
          <div role="group" aria-labelledby="show-confirm-dialog-heading">
            <Checkbox
              label="Removing repositories"
              value={
                this.state.confirmRepositoryRemoval
                  ? CheckboxValue.On
                  : CheckboxValue.Off
              }
              onChange={this.onConfirmRepositoryRemovalChanged}
            />
            <Checkbox
              label="Discarding changes"
              value={
                this.state.confirmDiscardChanges
                  ? CheckboxValue.On
                  : CheckboxValue.Off
              }
              onChange={this.onConfirmDiscardChangesChanged}
            />
            <Checkbox
              label="Discarding changes permanently"
              value={
                this.state.confirmDiscardChangesPermanently
                  ? CheckboxValue.On
                  : CheckboxValue.Off
              }
              onChange={this.onConfirmDiscardChangesPermanentlyChanged}
            />
            <Checkbox
              label="Discarding stash"
              value={
                this.state.confirmDiscardStash
                  ? CheckboxValue.On
                  : CheckboxValue.Off
              }
              onChange={this.onConfirmDiscardStashChanged}
            />
            <Checkbox
              label="Checking out a commit"
              value={
                this.state.confirmCheckoutCommit
                  ? CheckboxValue.On
                  : CheckboxValue.Off
              }
              onChange={this.onConfirmCheckoutCommitChanged}
            />
            <Checkbox
              label="Force pushing"
              value={
                this.state.confirmForcePush
                  ? CheckboxValue.On
                  : CheckboxValue.Off
              }
              onChange={this.onConfirmForcePushChanged}
            />
            <Checkbox
              label="Undo commit"
              value={
                this.state.confirmUndoCommit
                  ? CheckboxValue.On
                  : CheckboxValue.Off
              }
              onChange={this.onConfirmUndoCommitChanged}
            />
          </div>
        </div>
        {this.renderSwitchBranchOptions()}
        <div className="advanced-section">
          <h2>Commit Length</h2>
          <Checkbox
            label="Show commit length warning"
            value={
              this.props.showCommitLengthWarning
                ? CheckboxValue.On
                : CheckboxValue.Off
            }
            onChange={this.onShowCommitLengthWarningChanged}
          />
        </div>
      </DialogContent>
    )
  }
}
