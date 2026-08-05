import * as React from 'react'
import type { IBYOKProvider } from '../../lib/copilot/byok'
import { isGHES } from '../../lib/endpoint-capabilities'
import { enableCopilotSdkCommitMessageGeneration } from '../../lib/feature-flag'
import {
  type CopilotFeature,
  getCopilotAccountCacheKey,
  type CopilotModelsByAccount,
  type CopilotModelSelections,
  type CopilotModelSelectionsByAccount,
  type CopilotQuotaSnapshotsByAccount,
  type CopilotQuotaSnapshots,
} from '../../lib/stores/copilot-store'
import {
  CopilotLicenseTypeNoAccess,
  isDotComAccount,
  isEnterpriseAccount,
  type Account,
} from '../../models/account'
import { DialogContent, DialogPreferredFocusClassName } from '../dialog'
import { CallToAction } from '../lib/call-to-action'
import type { Model } from '@github/copilot-sdk/dist/generated/rpc'
import { CopilotUserSettings } from './copilot-user-settings'
import { SnapshotCard } from './snapshot-card'

interface ICopilotPreferencesProps {
  readonly selectedCopilotModelsByAccount: CopilotModelSelectionsByAccount
  readonly copilotModelsByAccount: CopilotModelsByAccount
  readonly copilotQuotaSnapshotsByAccount: CopilotQuotaSnapshotsByAccount
  readonly accounts: ReadonlyArray<Account>
  readonly byokProviders: ReadonlyArray<IBYOKProvider>
  readonly showBYOKSettings: boolean
  readonly onSignIn: () => void
  readonly onOpenCopilotPlans: () => void
  readonly onOpenCopilotFeatureSettings: () => void
  readonly alwaysUseCopilotForConflictResolution: boolean
  readonly onSelectedCopilotModelChanged: (
    account: Account,
    feature: CopilotFeature,
    model: string | null
  ) => void
  readonly onAlwaysUseCopilotForConflictResolutionChanged: (
    checked: boolean
  ) => void
  readonly onConfigureCustomProviders: () => void
  readonly onConfigureModels: (account: Account) => void
}

type CopilotAccessState =
  | 'signed-out'
  | 'checking'
  | 'no-license'
  | 'desktop-disabled'

export class CopilotPreferences extends React.Component<ICopilotPreferencesProps> {
  public render() {
    const accounts = this.getCopilotSettingsAccounts()

    if (accounts.length === 1) {
      return (
        <DialogContent className="copilot-tab">
          {this.renderUserSettings(accounts[0])}
        </DialogContent>
      )
    }

    if (accounts.length > 1) {
      return (
        <DialogContent className="copilot-tab">
          {this.renderAccountSnapshotCards(accounts)}
        </DialogContent>
      )
    }

    const accessState = this.getCopilotAccessState()

    return (
      <DialogContent className="copilot-tab">
        <div className="copilot-tab-content">
          <div className="copilot-section">
            {this.renderAccessState(accessState)}
          </div>
        </div>
      </DialogContent>
    )
  }

  private renderUserSettings(account: Account): JSX.Element {
    return (
      <CopilotUserSettings
        account={account}
        selectedCopilotModels={this.getSelectedCopilotModels(account)}
        copilotModels={this.getCopilotModels(account)}
        copilotQuotaSnapshots={this.getCopilotQuotaSnapshots(account)}
        byokProviders={this.props.byokProviders}
        showBYOKSettings={this.props.showBYOKSettings}
        alwaysUseCopilotForConflictResolution={
          this.props.alwaysUseCopilotForConflictResolution
        }
        onSelectedCopilotModelChanged={this.props.onSelectedCopilotModelChanged}
        onAlwaysUseCopilotForConflictResolutionChanged={
          this.props.onAlwaysUseCopilotForConflictResolutionChanged
        }
        onConfigureCustomProviders={this.props.onConfigureCustomProviders}
      />
    )
  }

  private renderAccountSnapshotCards(
    accounts: ReadonlyArray<Account>
  ): JSX.Element {
    const dotComAccounts = accounts.filter(isDotComAccount)
    const enterpriseAccounts = accounts.filter(isEnterpriseAccount)

    return (
      <div className="copilot-tab-content">
        <div className="copilot-settings-scroll">
          <div className="copilot-section copilot-account-snapshot-groups">
            {this.renderAccountSnapshotCardGroup('GitHub.com', dotComAccounts)}
            {this.renderAccountSnapshotCardGroup(
              'GitHub Enterprise',
              enterpriseAccounts
            )}
          </div>
        </div>
      </div>
    )
  }

  private renderAccountSnapshotCardGroup(
    heading: string,
    accounts: ReadonlyArray<Account>
  ): JSX.Element | null {
    if (accounts.length === 0) {
      return null
    }

    return (
      <div className="copilot-account-snapshot-card-group">
        <h2>{heading}</h2>
        <div className="copilot-account-snapshot-card-list">
          {accounts.map(account => (
            <SnapshotCard
              key={getCopilotAccountCacheKey(account)}
              account={account}
              snapshots={this.getCopilotQuotaSnapshots(account)}
              onConfigureModels={this.props.onConfigureModels}
            />
          ))}
        </div>
      </div>
    )
  }

  private getCopilotAccounts(): ReadonlyArray<Account> {
    return this.props.accounts.filter(account => !isGHES(account.endpoint))
  }

  private getCopilotSettingsAccounts(): ReadonlyArray<Account> {
    return this.getCopilotAccounts().filter(
      account =>
        enableCopilotSdkCommitMessageGeneration(account) &&
        account.isCopilotDesktopEnabled === true &&
        account.copilotLicenseType !== undefined &&
        account.copilotLicenseType !== CopilotLicenseTypeNoAccess
    )
  }

  private getCopilotModels(account: Account): ReadonlyArray<Model> | null {
    return (
      this.props.copilotModelsByAccount.get(
        getCopilotAccountCacheKey(account)
      ) ?? null
    )
  }

  private getSelectedCopilotModels(account: Account): CopilotModelSelections {
    return (
      this.props.selectedCopilotModelsByAccount.get(
        getCopilotAccountCacheKey(account)
      ) ?? {}
    )
  }

  private getCopilotQuotaSnapshots(
    account: Account
  ): CopilotQuotaSnapshots | null {
    return (
      this.props.copilotQuotaSnapshotsByAccount.get(
        getCopilotAccountCacheKey(account)
      ) ?? null
    )
  }

  private getCopilotAccessState(): CopilotAccessState {
    const accounts = this.getCopilotAccounts()

    if (accounts.length === 0) {
      return 'signed-out'
    }

    let hasCheckingAccount = false
    let hasNoAccessAccount = false
    let hasDesktopDisabledAccount = false

    for (const account of accounts) {
      if (
        account.copilotLicenseType === undefined ||
        account.isCopilotDesktopEnabled === undefined
      ) {
        hasCheckingAccount = true
      } else if (account.copilotLicenseType === CopilotLicenseTypeNoAccess) {
        hasNoAccessAccount = true
      } else if (account.isCopilotDesktopEnabled === false) {
        hasDesktopDisabledAccount = true
      }
    }

    if (hasCheckingAccount) {
      return 'checking'
    }

    if (hasDesktopDisabledAccount) {
      return 'desktop-disabled'
    }

    if (hasNoAccessAccount) {
      return 'no-license'
    }

    return 'checking'
  }

  private renderAccessState(accessState: CopilotAccessState): JSX.Element {
    switch (accessState) {
      case 'signed-out':
        return this.renderAccessCallToAction(
          'Sign in to an account with a Copilot license to configure Copilot settings.',
          'Sign In',
          this.props.onSignIn,
          DialogPreferredFocusClassName
        )
      case 'checking':
        return <p>Checking Copilot access…</p>
      case 'no-license':
        return this.renderAccessCallToAction(
          'Copilot features in GitHub Desktop require a GitHub Copilot license.',
          'View Copilot plans',
          this.props.onOpenCopilotPlans
        )
      case 'desktop-disabled':
        return this.renderAccessCallToAction(
          'A Copilot license is available for your account, but "Copilot in GitHub Desktop" is disabled in your Copilot feature settings.',
          'Open Copilot feature settings',
          this.props.onOpenCopilotFeatureSettings
        )
    }
  }

  private renderAccessCallToAction(
    message: string,
    actionTitle: string,
    onAction: () => void,
    buttonClassName?: string
  ): JSX.Element {
    return (
      <div className="copilot-access-call-to-action">
        <CallToAction
          actionTitle={actionTitle}
          onAction={onAction}
          buttonClassName={buttonClassName}
        >
          <div>{message}</div>
        </CallToAction>
      </div>
    )
  }
}
