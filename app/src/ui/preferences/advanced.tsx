import * as React from 'react'
import { DialogContent } from '../dialog'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { LinkButton } from '../lib/link-button'
import { SamplesURL } from '../../lib/stats'
import { UncommittedChangesStrategy } from '../../models/uncommitted-changes-strategy'
import { RadioButton } from '../lib/radio-button'
import { isWindowsOpenSSHAvailable } from '../../lib/ssh/ssh'
import {
  getNotificationSettingsUrl,
  supportsNotifications,
  supportsNotificationsPermissionRequest,
} from 'desktop-notifications'
import {
  getNotificationsPermission,
  requestNotificationsPermission,
} from '../main-process-proxy'

interface IAdvancedPreferencesProps {
  readonly useWindowsOpenSSH: boolean
  readonly optOutOfUsageTracking: boolean
  readonly notificationsEnabled: boolean
  readonly uncommittedChangesStrategy: UncommittedChangesStrategy
  readonly repositoryIndicatorsEnabled: boolean
  readonly onUseWindowsOpenSSHChanged: (checked: boolean) => void
  readonly onNotificationsEnabledChanged: (checked: boolean) => void
  readonly onOptOutofReportingChanged: (checked: boolean) => void
  readonly onUncommittedChangesStrategyChanged: (
    value: UncommittedChangesStrategy
  ) => void
  readonly onRepositoryIndicatorsEnabledChanged: (enabled: boolean) => void
}

interface IAdvancedPreferencesState {
  readonly optOutOfUsageTracking: boolean
  readonly uncommittedChangesStrategy: UncommittedChangesStrategy
  readonly canUseWindowsSSH: boolean
  readonly suggestGrantNotificationPermission: boolean
  readonly warnNotificationsDenied: boolean
  readonly suggestConfigureNotifications: boolean
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
      canUseWindowsSSH: false,
      suggestGrantNotificationPermission: false,
      warnNotificationsDenied: false,
      suggestConfigureNotifications: false,
    }
  }

  public componentDidMount() {
    this.checkSSHAvailability()
    this.updateNotificationsState()
  }

  private async checkSSHAvailability() {
    this.setState({ canUseWindowsSSH: await isWindowsOpenSSHAvailable() })
  }

  private onReportingOptOutChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = !event.currentTarget.checked

    this.setState({ optOutOfUsageTracking: value })
    this.props.onOptOutofReportingChanged(value)
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

  private onUseWindowsOpenSSHChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.props.onUseWindowsOpenSSHChanged(event.currentTarget.checked)
  }

  private onNotificationsEnabledChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.props.onNotificationsEnabledChanged(event.currentTarget.checked)
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
        {this.renderSSHSettings()}
        {this.renderNotificationsSettings()}
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
      </DialogContent>
    )
  }

  private renderSSHSettings() {
    if (!this.state.canUseWindowsSSH) {
      return null
    }

    return (
      <div className="advanced-section">
        <h2>SSH</h2>
        <Checkbox
          label="Use system OpenSSH (recommended)"
          value={
            this.props.useWindowsOpenSSH ? CheckboxValue.On : CheckboxValue.Off
          }
          onChange={this.onUseWindowsOpenSSHChanged}
        />
      </div>
    )
  }

  private renderNotificationsSettings() {
    return (
      <div className="advanced-section">
        <h2>Notifications</h2>
        <Checkbox
          label="Enable notifications"
          value={
            this.props.notificationsEnabled
              ? CheckboxValue.On
              : CheckboxValue.Off
          }
          onChange={this.onNotificationsEnabledChanged}
        />
        <p className="git-settings-description">
          Allows the display of notifications when high-signal events take place
          in the current repository.{this.renderNotificationHint()}
        </p>
      </div>
    )
  }

  private onGrantNotificationPermission = async () => {
    await requestNotificationsPermission()
    this.updateNotificationsState()
  }

  private async updateNotificationsState() {
    const notificationsPermission = await getNotificationsPermission()
    this.setState({
      suggestGrantNotificationPermission:
        supportsNotificationsPermissionRequest() &&
        notificationsPermission === 'default',
      warnNotificationsDenied: notificationsPermission === 'denied',
      suggestConfigureNotifications: notificationsPermission === 'granted',
    })
  }

  private renderNotificationHint() {
    // No need to bother the user if their environment doesn't support our
    // notifications or if they've been explicitly disabled.
    if (!supportsNotifications() || !this.props.notificationsEnabled) {
      return null
    }

    const {
      suggestGrantNotificationPermission,
      warnNotificationsDenied,
      suggestConfigureNotifications,
    } = this.state

    if (suggestGrantNotificationPermission) {
      return (
        <>
          {' '}
          You need to{' '}
          <LinkButton onClick={this.onGrantNotificationPermission}>
            grant permission
          </LinkButton>{' '}
          to display these notifications from GitHub Desktop.
        </>
      )
    }

    const notificationSettingsURL = getNotificationSettingsUrl()

    if (notificationSettingsURL === null) {
      return null
    }

    if (warnNotificationsDenied) {
      return (
        <>
          <br />
          <br />
          <span className="warning-icon">⚠️</span> GitHub Desktop has no
          permission to display notifications. Please, enable them in the{' '}
          <LinkButton uri={notificationSettingsURL}>
            Notifications Settings
          </LinkButton>
          .
        </>
      )
    }

    const verb = suggestConfigureNotifications
      ? 'properly configured'
      : 'enabled'

    return (
      <>
        {' '}
        Make sure notifications are {verb} for GitHub Desktop in the{' '}
        <LinkButton uri={notificationSettingsURL}>
          Notifications Settings
        </LinkButton>
        .
      </>
    )
  }
}
