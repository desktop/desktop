import * as React from 'react'
import { DialogContent } from '../dialog'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { LinkButton } from '../lib/link-button'
import { SamplesURL } from '../../lib/stats'
import { UncommittedChangesStrategyKind } from '../../models/uncommitted-changes-strategy'
import { enableSchannelCheckRevokeOptOut } from '../../lib/feature-flag'

interface IAdvancedPreferencesProps {
  readonly optOutOfUsageTracking: boolean
  readonly confirmRepositoryRemoval: boolean
  readonly confirmDiscardChanges: boolean
  readonly confirmForcePush: boolean
  readonly uncommittedChangesStrategyKind: UncommittedChangesStrategyKind
  readonly schannelCheckRevoke: boolean | null
  readonly onOptOutofReportingchanged: (checked: boolean) => void
  readonly onConfirmDiscardChangesChanged: (checked: boolean) => void
  readonly onConfirmRepositoryRemovalChanged: (checked: boolean) => void
  readonly onConfirmForcePushChanged: (checked: boolean) => void
  readonly onUncommittedChangesStrategyKindChanged: (
    value: UncommittedChangesStrategyKind
  ) => void
  readonly onSchannelCheckRevokeChanged: (checked: boolean) => void
}

interface IAdvancedPreferencesState {
  readonly optOutOfUsageTracking: boolean
  readonly confirmRepositoryRemoval: boolean
  readonly confirmDiscardChanges: boolean
  readonly confirmForcePush: boolean
  readonly uncommittedChangesStrategyKind: UncommittedChangesStrategyKind
}

export class Advanced extends React.Component<
  IAdvancedPreferencesProps,
  IAdvancedPreferencesState
> {
  public constructor(props: IAdvancedPreferencesProps) {
    super(props)

    this.state = {
      optOutOfUsageTracking: this.props.optOutOfUsageTracking,
      confirmRepositoryRemoval: this.props.confirmRepositoryRemoval,
      confirmDiscardChanges: this.props.confirmDiscardChanges,
      confirmForcePush: this.props.confirmForcePush,
      uncommittedChangesStrategyKind: this.props.uncommittedChangesStrategyKind,
    }
  }

  private onReportingOptOutChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = !event.currentTarget.checked

    this.setState({ optOutOfUsageTracking: value })
    this.props.onOptOutofReportingchanged(value)
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

  private onConfirmRepositoryRemovalChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = event.currentTarget.checked

    this.setState({ confirmRepositoryRemoval: value })
    this.props.onConfirmRepositoryRemovalChanged(value)
  }

  private onUncommittedChangesStrategyKindChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = event.currentTarget.value as UncommittedChangesStrategyKind

    this.setState({ uncommittedChangesStrategyKind: value })
    this.props.onUncommittedChangesStrategyKindChanged(value)
  }

  private onSchannelCheckRevokeChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = event.currentTarget.checked
    this.props.onSchannelCheckRevokeChanged(value === false)
  }

  private reportDesktopUsageLabel() {
    return (
      <span>
        Help GitHub Desktop improve by submitting{' '}
        <LinkButton uri={SamplesURL}>usage stats</LinkButton>
      </span>
    )
  }

  public render() {
    return (
      <DialogContent>
        <div className="advanced-section">
          <h2>If I have changes and I switch branches...</h2>
          <div className="radio-component">
            <input
              type="radio"
              id={UncommittedChangesStrategyKind.AskForConfirmation}
              value={UncommittedChangesStrategyKind.AskForConfirmation}
              checked={
                this.state.uncommittedChangesStrategyKind ===
                UncommittedChangesStrategyKind.AskForConfirmation
              }
              onChange={this.onUncommittedChangesStrategyKindChanged}
            />
            <label htmlFor={UncommittedChangesStrategyKind.AskForConfirmation}>
              Ask me where I want the changes to go
            </label>
          </div>
          <div className="radio-component">
            <input
              type="radio"
              id={UncommittedChangesStrategyKind.MoveToNewBranch}
              value={UncommittedChangesStrategyKind.MoveToNewBranch}
              checked={
                this.state.uncommittedChangesStrategyKind ===
                UncommittedChangesStrategyKind.MoveToNewBranch
              }
              onChange={this.onUncommittedChangesStrategyKindChanged}
            />
            <label htmlFor={UncommittedChangesStrategyKind.MoveToNewBranch}>
              Always bring my changes to my new branch
            </label>
          </div>
          <div className="radio-component">
            <input
              type="radio"
              id={UncommittedChangesStrategyKind.StashOnCurrentBranch}
              value={UncommittedChangesStrategyKind.StashOnCurrentBranch}
              checked={
                this.state.uncommittedChangesStrategyKind ===
                UncommittedChangesStrategyKind.StashOnCurrentBranch
              }
              onChange={this.onUncommittedChangesStrategyKindChanged}
            />
            <label
              htmlFor={UncommittedChangesStrategyKind.StashOnCurrentBranch}
            >
              Always stash and leave my changes on the current branch
            </label>
          </div>
        </div>
        <div className="advanced-section">
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
        </div>
        <div className="advanced-section">
          <h2>Usage</h2>
          <Checkbox
            label={this.reportDesktopUsageLabel()}
            value={
              this.state.optOutOfUsageTracking
                ? CheckboxValue.Off
                : CheckboxValue.On
            }
            onChange={this.onReportingOptOutChanged}
          />
        </div>
        {this.renderGitAdvancedSection()}
      </DialogContent>
    )
  }

  private renderGitAdvancedSection() {
    if (!__WIN32__) {
      return
    }

    if (!enableSchannelCheckRevokeOptOut()) {
      return
    }

    // If the user hasn't set `http.schannelCheckRevoke` before we don't
    // have to show them the preference.
    if (this.props.schannelCheckRevoke === null) {
      return
    }

    return (
      <div className="git-advanced-section">
        <h2>Git</h2>
        <Checkbox
          label="Disable certificate revocation checks"
          value={
            this.props.schannelCheckRevoke
              ? CheckboxValue.Off
              : CheckboxValue.On
          }
          onChange={this.onSchannelCheckRevokeChanged}
        />
      </div>
    )
  }
}
