import * as React from 'react'
import { enableAutomaticCommitSigning } from '../../lib/feature-flag'
import { DialogContent } from '../dialog'
import { Checkbox, CheckboxValue } from '../lib/checkbox'

interface IPromptsPreferencesProps {
  readonly confirmRepositoryRemoval: boolean
  readonly confirmDiscardChanges: boolean
  readonly confirmForcePush: boolean
  readonly confirmCommitWithoutSigning: boolean
  readonly onConfirmDiscardChangesChanged: (checked: boolean) => void
  readonly onConfirmRepositoryRemovalChanged: (checked: boolean) => void
  readonly onConfirmForcePushChanged: (checked: boolean) => void
  readonly onConfirmCommitWithoutSigningChanged: (checked: boolean) => void
}

interface IPromptsPreferencesState {
  readonly confirmRepositoryRemoval: boolean
  readonly confirmDiscardChanges: boolean
  readonly confirmForcePush: boolean
  readonly confirmCommitWithoutSigning: boolean
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
      confirmForcePush: this.props.confirmForcePush,
      confirmCommitWithoutSigning: this.props.confirmCommitWithoutSigning,
    }
  }

  private onConfirmDiscardChangesChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = event.currentTarget.checked

    this.setState({ confirmDiscardChanges: value })
    this.props.onConfirmDiscardChangesChanged(value)
  }

  private onConfirmForcePushChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = event.currentTarget.checked

    this.setState({ confirmForcePush: value })
    this.props.onConfirmForcePushChanged(value)
  }

  private onConfirmCommitWithoutSigningChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = event.currentTarget.checked

    this.setState({ confirmCommitWithoutSigning: value })
    this.props.onConfirmCommitWithoutSigningChanged(value)
  }

  private onConfirmRepositoryRemovalChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = event.currentTarget.checked

    this.setState({ confirmRepositoryRemoval: value })
    this.props.onConfirmRepositoryRemovalChanged(value)
  }

  public render() {
    return (
      <DialogContent>
        <h2>Show a confirmation dialog before...</h2>
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
          label="Force pushing"
          value={
            this.state.confirmForcePush ? CheckboxValue.On : CheckboxValue.Off
          }
          onChange={this.onConfirmForcePushChanged}
        />
        {enableAutomaticCommitSigning() && (
          <Checkbox
            label="Committing without signing"
            value={
              this.state.confirmCommitWithoutSigning
                ? CheckboxValue.On
                : CheckboxValue.Off
            }
            onChange={this.onConfirmCommitWithoutSigningChanged}
          />
        )}
      </DialogContent>
    )
  }
}
