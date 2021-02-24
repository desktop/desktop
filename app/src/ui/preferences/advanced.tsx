import * as React from 'react'
import { DialogContent } from '../dialog'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { LinkButton } from '../lib/link-button'
import { SamplesURL } from '../../lib/stats'
import { UncommittedChangesStrategy } from '../../models/uncommitted-changes-strategy'
import { RadioButton } from '../lib/radio-button'
import { Select } from '../lib/select'
import { AppUpdateChannel } from '../../models/app-update-channel'
import { parseEnumValue } from '../../lib/enum'
import {
  canUpdateApp,
  getUnableToUpdateAppWarning,
} from '../lib/version-update-warning'

interface IAdvancedPreferencesProps {
  readonly optOutOfUsageTracking: boolean
  readonly uncommittedChangesStrategy: UncommittedChangesStrategy
  readonly repositoryIndicatorsEnabled: boolean
  readonly appUpdateChannel: AppUpdateChannel
  readonly onOptOutofReportingchanged: (checked: boolean) => void
  readonly onUncommittedChangesStrategyChanged: (
    value: UncommittedChangesStrategy
  ) => void
  readonly onRepositoryIndicatorsEnabledChanged: (enabled: boolean) => void
  readonly onAppUpdateChannelChanged: (channel: AppUpdateChannel) => void
}

interface IAdvancedPreferencesState {
  readonly optOutOfUsageTracking: boolean
  readonly uncommittedChangesStrategy: UncommittedChangesStrategy
}

export class Advanced extends React.Component<
  IAdvancedPreferencesProps,
  IAdvancedPreferencesState
> {
  public constructor(props: IAdvancedPreferencesProps) {
    super(props)

    this.state = {
      optOutOfUsageTracking: this.props.optOutOfUsageTracking,
      uncommittedChangesStrategy: this.props.uncommittedChangesStrategy,
    }
  }

  private onReportingOptOutChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = !event.currentTarget.checked

    this.setState({ optOutOfUsageTracking: value })
    this.props.onOptOutofReportingchanged(value)
  }

  private onUpdateChannelChanged = (
    event: React.FormEvent<HTMLSelectElement>
  ) => {
    const value = parseEnumValue(AppUpdateChannel, event.currentTarget.value)
    if (value !== undefined) {
      this.props.onAppUpdateChannelChanged(value)
    }
  }

  private onUncommittedChangesStrategyChanged = (
    value: UncommittedChangesStrategy
  ) => {
    this.setState({ uncommittedChangesStrategy: value })
    this.props.onUncommittedChangesStrategyChanged(value)
  }

  private onRepositoryIndicatorsEnabledChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.props.onRepositoryIndicatorsEnabledChanged(event.currentTarget.checked)
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

          <RadioButton
            value={UncommittedChangesStrategy.AskForConfirmation}
            checked={
              this.state.uncommittedChangesStrategy ===
              UncommittedChangesStrategy.AskForConfirmation
            }
            label="Ask me where I want the changes to go"
            onSelected={this.onUncommittedChangesStrategyChanged}
          />

          <RadioButton
            value={UncommittedChangesStrategy.MoveToNewBranch}
            checked={
              this.state.uncommittedChangesStrategy ===
              UncommittedChangesStrategy.MoveToNewBranch
            }
            label="Always bring my changes to my new branch"
            onSelected={this.onUncommittedChangesStrategyChanged}
          />

          <RadioButton
            value={UncommittedChangesStrategy.StashOnCurrentBranch}
            checked={
              this.state.uncommittedChangesStrategy ===
              UncommittedChangesStrategy.StashOnCurrentBranch
            }
            label="Always stash and leave my changes on the current branch"
            onSelected={this.onUncommittedChangesStrategyChanged}
          />
        </div>
        <div className="advanced-section">
          <h2>Background updates</h2>
          <Checkbox
            label="Periodically fetch and refresh status of all repositories"
            value={
              this.props.repositoryIndicatorsEnabled
                ? CheckboxValue.On
                : CheckboxValue.Off
            }
            onChange={this.onRepositoryIndicatorsEnabledChanged}
          />
          <p className="git-settings-description">
            Allows the display of up-to-date status indicators in the repository
            list. Disabling this may improve performance with many repositories.
          </p>
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
        <div className="advanced-section">
          <h2>Updates channel</h2>
          {this.renderUpdatesChannelContent()}
        </div>
      </DialogContent>
    )
  }

  private renderUpdatesChannelContent() {
    if (!canUpdateApp()) {
      return <p>{getUnableToUpdateAppWarning()}</p>
    }

    return (
      <>
        <Select
          value={this.props.appUpdateChannel}
          onChange={this.onUpdateChannelChanged}
        >
          <option value={AppUpdateChannel.Stable}>Stable</option>
          <option value={AppUpdateChannel.Beta}>Beta</option>
        </Select>
        <p className="git-settings-description">
          · Stable: less frequent updates, but more reliable.
          <br />· Beta: more frequent updates, with early access to new
          features.
        </p>
      </>
    )
  }
}
