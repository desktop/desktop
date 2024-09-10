import * as React from 'react'
import { Account } from '../../models/account'
import { PreferencesTab } from '../../models/preferences'
import { Dispatcher } from '../dispatcher'
import { TabBar, TabBarType } from '../tab-bar'
import { Accounts } from './accounts'
import { Advanced } from './advanced'
import { Git } from './git'
import { assertNever } from '../../lib/fatal-error'
import { Dialog, DialogFooter, DialogError } from '../dialog'
import {
  getGlobalConfigValue,
  setGlobalConfigValue,
} from '../../lib/git/config'
import { getGlobalConfigPath } from '../../lib/git'
import { lookupPreferredEmail } from '../../lib/email'
import { Shell, getAvailableShells } from '../../lib/shells'
import { getAvailableEditors } from '../../lib/editors/lookup'
import {
  gitAuthorNameIsValid,
  InvalidGitAuthorNameMessage,
} from '../lib/identifier-rules'
import { Appearance } from './appearance'
import { ApplicationTheme } from '../lib/application-theme'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Integrations } from './integrations'
import {
  UncommittedChangesStrategy,
  defaultUncommittedChangesStrategy,
} from '../../models/uncommitted-changes-strategy'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import {
  isConfigFileLockError,
  parseConfigLockFilePathFromError,
} from '../../lib/git'
import { ConfigLockFileExists } from '../lib/config-lock-file-exists'
import {
  setDefaultBranch,
  getDefaultBranch,
} from '../../lib/helpers/default-branch'
import { Prompts } from './prompts'
import { Repository } from '../../models/repository'
import { Notifications } from './notifications'
import { Accessibility } from './accessibility'
import {
  enableExternalCredentialHelper,
  enableLinkUnderlines,
} from '../../lib/feature-flag'
import {
  ICustomIntegration,
  TargetPathArgument,
  isValidCustomIntegration,
} from '../../lib/custom-integration'

interface IPreferencesProps {
  readonly dispatcher: Dispatcher
  readonly dotComAccount: Account | null
  readonly enterpriseAccount: Account | null
  readonly repository: Repository | null
  readonly onDismissed: () => void
  readonly useWindowsOpenSSH: boolean
  readonly showCommitLengthWarning: boolean
  readonly notificationsEnabled: boolean
  readonly optOutOfUsageTracking: boolean
  readonly useExternalCredentialHelper: boolean
  readonly initialSelectedTab?: PreferencesTab
  readonly confirmRepositoryRemoval: boolean
  readonly confirmDiscardChanges: boolean
  readonly confirmDiscardChangesPermanently: boolean
  readonly confirmDiscardStash: boolean
  readonly confirmCheckoutCommit: boolean
  readonly confirmForcePush: boolean
  readonly confirmUndoCommit: boolean
  readonly uncommittedChangesStrategy: UncommittedChangesStrategy
  readonly selectedExternalEditor: string | null
  readonly selectedShell: Shell
  readonly selectedTheme: ApplicationTheme
  readonly selectedTabSize: number
  readonly useCustomEditor: boolean
  readonly customEditor: ICustomIntegration | null
  readonly useCustomShell: boolean
  readonly customShell: ICustomIntegration | null
  readonly repositoryIndicatorsEnabled: boolean
  readonly onOpenFileInExternalEditor: (path: string) => void
  readonly underlineLinks: boolean
  readonly showDiffCheckMarks: boolean
}

interface IPreferencesState {
  readonly selectedIndex: PreferencesTab
  readonly committerName: string
  readonly committerEmail: string
  readonly defaultBranch: string
  readonly initialCommitterName: string | null
  readonly initialCommitterEmail: string | null
  readonly initialDefaultBranch: string | null
  readonly disallowedCharactersMessage: string | null
  readonly useWindowsOpenSSH: boolean
  readonly showCommitLengthWarning: boolean
  readonly notificationsEnabled: boolean
  readonly optOutOfUsageTracking: boolean
  readonly useExternalCredentialHelper: boolean
  readonly confirmRepositoryRemoval: boolean
  readonly confirmDiscardChanges: boolean
  readonly confirmDiscardChangesPermanently: boolean
  readonly confirmDiscardStash: boolean
  readonly confirmCheckoutCommit: boolean
  readonly confirmForcePush: boolean
  readonly confirmUndoCommit: boolean
  readonly uncommittedChangesStrategy: UncommittedChangesStrategy
  readonly availableEditors: ReadonlyArray<string>
  readonly useCustomEditor: boolean
  readonly customEditor: ICustomIntegration
  readonly useCustomShell: boolean
  readonly customShell: ICustomIntegration
  readonly selectedExternalEditor: string | null
  readonly availableShells: ReadonlyArray<Shell>
  readonly selectedShell: Shell

  /**
   * If unable to save Git configuration values (name, email)
   * due to an existing configuration lock file this property
   * will contain the (fully qualified) path to said lock file
   * such that an error may be presented and the user given a
   * choice to delete the lock file.
   */
  readonly existingLockFilePath?: string
  readonly repositoryIndicatorsEnabled: boolean

  readonly initiallySelectedTheme: ApplicationTheme
  readonly initiallySelectedTabSize: number

  readonly isLoadingGitConfig: boolean
  readonly globalGitConfigPath: string | null

  readonly underlineLinks: boolean

  readonly showDiffCheckMarks: boolean
}

/**
 * Default custom integration values to coalesce with. We can't make up a path
 * nor a bundle ID, but we can at least provide a default argument.
 */
const DefaultCustomIntegration: ICustomIntegration = {
  path: '',
  bundleID: undefined,
  arguments: TargetPathArgument,
}

/** The app-level preferences component. */
export class Preferences extends React.Component<
  IPreferencesProps,
  IPreferencesState
> {
  public constructor(props: IPreferencesProps) {
    super(props)

    this.state = {
      selectedIndex: this.props.initialSelectedTab || PreferencesTab.Accounts,
      committerName: '',
      committerEmail: '',
      defaultBranch: '',
      initialCommitterName: null,
      initialCommitterEmail: null,
      initialDefaultBranch: null,
      disallowedCharactersMessage: null,
      availableEditors: [],
      useCustomEditor: this.props.useCustomEditor,
      customEditor: this.props.customEditor ?? DefaultCustomIntegration,
      useCustomShell: this.props.useCustomShell,
      customShell: this.props.customShell ?? DefaultCustomIntegration,
      useWindowsOpenSSH: false,
      showCommitLengthWarning: false,
      notificationsEnabled: true,
      optOutOfUsageTracking: false,
      useExternalCredentialHelper: false,
      confirmRepositoryRemoval: false,
      confirmDiscardChanges: false,
      confirmDiscardChangesPermanently: false,
      confirmDiscardStash: false,
      confirmCheckoutCommit: false,
      confirmForcePush: false,
      confirmUndoCommit: false,
      uncommittedChangesStrategy: defaultUncommittedChangesStrategy,
      selectedExternalEditor: this.props.selectedExternalEditor,
      availableShells: [],
      selectedShell: this.props.selectedShell,
      repositoryIndicatorsEnabled: this.props.repositoryIndicatorsEnabled,
      initiallySelectedTheme: this.props.selectedTheme,
      initiallySelectedTabSize: this.props.selectedTabSize,
      isLoadingGitConfig: true,
      globalGitConfigPath: null,
      underlineLinks: this.props.underlineLinks,
      showDiffCheckMarks: this.props.showDiffCheckMarks,
    }
  }

  public async componentWillMount() {
    const initialCommitterName = await getGlobalConfigValue('user.name')
    const initialCommitterEmail = await getGlobalConfigValue('user.email')
    const initialDefaultBranch = await getDefaultBranch()

    let committerName = initialCommitterName
    let committerEmail = initialCommitterEmail

    if (!committerName || !committerEmail) {
      const account = this.props.dotComAccount || this.props.enterpriseAccount

      if (account) {
        if (!committerName) {
          committerName = account.login
        }

        if (!committerEmail) {
          committerEmail = lookupPreferredEmail(account)
        }
      }
    }

    committerName = committerName || ''
    committerEmail = committerEmail || ''

    const [editors, shells] = await Promise.all([
      getAvailableEditors(),
      getAvailableShells(),
    ])

    const availableEditors = editors.map(e => e.editor) ?? null
    const availableShells = shells.map(e => e.shell) ?? null

    const globalGitConfigPath = await getGlobalConfigPath()

    this.setState({
      committerName,
      committerEmail,
      defaultBranch: initialDefaultBranch,
      initialCommitterName,
      initialCommitterEmail,
      initialDefaultBranch,
      useWindowsOpenSSH: this.props.useWindowsOpenSSH,
      showCommitLengthWarning: this.props.showCommitLengthWarning,
      notificationsEnabled: this.props.notificationsEnabled,
      optOutOfUsageTracking: this.props.optOutOfUsageTracking,
      useExternalCredentialHelper: this.props.useExternalCredentialHelper,
      confirmRepositoryRemoval: this.props.confirmRepositoryRemoval,
      confirmDiscardChanges: this.props.confirmDiscardChanges,
      confirmDiscardChangesPermanently:
        this.props.confirmDiscardChangesPermanently,
      confirmDiscardStash: this.props.confirmDiscardStash,
      confirmCheckoutCommit: this.props.confirmCheckoutCommit,
      confirmForcePush: this.props.confirmForcePush,
      confirmUndoCommit: this.props.confirmUndoCommit,
      uncommittedChangesStrategy: this.props.uncommittedChangesStrategy,
      availableShells,
      availableEditors,
      useCustomEditor: this.props.useCustomEditor,
      customEditor: this.props.customEditor ?? DefaultCustomIntegration,
      useCustomShell: this.props.useCustomShell,
      customShell: this.props.customShell ?? DefaultCustomIntegration,
      isLoadingGitConfig: false,
      globalGitConfigPath,
    })
  }

  private onCancel = () => {
    if (this.state.initiallySelectedTheme !== this.props.selectedTheme) {
      this.onSelectedThemeChanged(this.state.initiallySelectedTheme)
    }
    if (this.state.initiallySelectedTabSize !== this.props.selectedTabSize) {
      this.onSelectedTabSizeChanged(this.state.initiallySelectedTabSize)
    }

    this.props.onDismissed()
  }

  public render() {
    return (
      <Dialog
        id="preferences"
        title={__DARWIN__ ? 'Settings' : 'Options'}
        onDismissed={this.onCancel}
        onSubmit={this.onSave}
      >
        <div className="preferences-container">
          {this.renderDisallowedCharactersError()}
          <TabBar
            onTabClicked={this.onTabClicked}
            selectedIndex={this.state.selectedIndex}
            type={TabBarType.Vertical}
          >
            <span id={this.getTabId(PreferencesTab.Accounts)}>
              <Octicon className="icon" symbol={octicons.home} />
              Accounts
            </span>
            <span id={this.getTabId(PreferencesTab.Integrations)}>
              <Octicon className="icon" symbol={octicons.person} />
              Integrations
            </span>
            <span id={this.getTabId(PreferencesTab.Git)}>
              <Octicon className="icon" symbol={octicons.gitCommit} />
              Git
            </span>
            <span id={this.getTabId(PreferencesTab.Appearance)}>
              <Octicon className="icon" symbol={octicons.paintbrush} />
              Appearance
            </span>
            <span id={this.getTabId(PreferencesTab.Notifications)}>
              <Octicon className="icon" symbol={octicons.bell} />
              Notifications
            </span>
            <span id={this.getTabId(PreferencesTab.Prompts)}>
              <Octicon className="icon" symbol={octicons.question} />
              Prompts
            </span>
            <span id={this.getTabId(PreferencesTab.Advanced)}>
              <Octicon className="icon" symbol={octicons.gear} />
              Advanced
            </span>
            {enableLinkUnderlines() && (
              <span id={this.getTabId(PreferencesTab.Accessibility)}>
                <Octicon className="icon" symbol={octicons.accessibility} />
                Accessibility
              </span>
            )}
          </TabBar>

          {this.renderActiveTab()}
        </div>
        {this.renderFooter()}
      </Dialog>
    )
  }

  private getTabId = (tab: PreferencesTab) => {
    let suffix
    switch (tab) {
      case PreferencesTab.Accounts:
        suffix = 'accounts'
        break
      case PreferencesTab.Integrations:
        suffix = 'integrations'
        break
      case PreferencesTab.Git:
        suffix = 'git'
        break
      case PreferencesTab.Appearance:
        suffix = 'appearance'
        break
      case PreferencesTab.Notifications:
        suffix = 'notifications'
        break
      case PreferencesTab.Prompts:
        suffix = 'prompts'
        break
      case PreferencesTab.Advanced:
        suffix = 'advanced'
        break
      case PreferencesTab.Accessibility:
        suffix = 'accessibility'
        break
      default:
        return assertNever(tab, `Unknown tab type: ${tab}`)
    }

    return `preferences-tab-${suffix}`
  }

  private onDotComSignIn = () => {
    this.props.onDismissed()
    this.props.dispatcher.showDotComSignInDialog()
  }

  private onEnterpriseSignIn = () => {
    this.props.onDismissed()
    this.props.dispatcher.showEnterpriseSignInDialog()
  }

  private onLogout = (account: Account) => {
    this.props.dispatcher.removeAccount(account)
  }

  private renderDisallowedCharactersError() {
    const message = this.state.disallowedCharactersMessage
    if (message != null) {
      return <DialogError>{message}</DialogError>
    } else {
      return null
    }
  }

  private renderActiveTab() {
    const index = this.state.selectedIndex
    let View
    switch (index) {
      case PreferencesTab.Accounts:
        View = (
          <Accounts
            dotComAccount={this.props.dotComAccount}
            enterpriseAccount={this.props.enterpriseAccount}
            onDotComSignIn={this.onDotComSignIn}
            onEnterpriseSignIn={this.onEnterpriseSignIn}
            onLogout={this.onLogout}
          />
        )
        break
      case PreferencesTab.Integrations: {
        View = (
          <Integrations
            availableEditors={this.state.availableEditors}
            selectedExternalEditor={this.state.selectedExternalEditor}
            onSelectedEditorChanged={this.onSelectedEditorChanged}
            availableShells={this.state.availableShells}
            selectedShell={this.state.selectedShell}
            useCustomEditor={this.state.useCustomEditor}
            customEditor={this.state.customEditor}
            useCustomShell={this.state.useCustomShell}
            customShell={this.state.customShell}
            onSelectedShellChanged={this.onSelectedShellChanged}
            onUseCustomEditorChanged={this.onUseCustomEditorChanged}
            onCustomEditorChanged={this.onCustomEditorChanged}
            onUseCustomShellChanged={this.onUseCustomShellChanged}
            onCustomShellChanged={this.onCustomShellChanged}
          />
        )
        break
      }
      case PreferencesTab.Git: {
        const { existingLockFilePath } = this.state
        const error =
          existingLockFilePath !== undefined ? (
            <DialogError>
              <ConfigLockFileExists
                lockFilePath={existingLockFilePath}
                onLockFileDeleted={this.onLockFileDeleted}
                onError={this.onLockFileDeleteError}
              />
            </DialogError>
          ) : null

        View = (
          <>
            {error}
            <Git
              name={this.state.committerName}
              email={this.state.committerEmail}
              defaultBranch={this.state.defaultBranch}
              dotComAccount={this.props.dotComAccount}
              enterpriseAccount={this.props.enterpriseAccount}
              onNameChanged={this.onCommitterNameChanged}
              onEmailChanged={this.onCommitterEmailChanged}
              onDefaultBranchChanged={this.onDefaultBranchChanged}
              isLoadingGitConfig={this.state.isLoadingGitConfig}
              selectedExternalEditor={this.props.selectedExternalEditor}
              onOpenFileInExternalEditor={this.props.onOpenFileInExternalEditor}
              globalGitConfigPath={this.state.globalGitConfigPath}
            />
          </>
        )
        break
      }
      case PreferencesTab.Appearance:
        View = (
          <Appearance
            selectedTheme={this.props.selectedTheme}
            onSelectedThemeChanged={this.onSelectedThemeChanged}
            selectedTabSize={this.props.selectedTabSize}
            onSelectedTabSizeChanged={this.onSelectedTabSizeChanged}
          />
        )
        break
      case PreferencesTab.Notifications:
        View = (
          <Notifications
            notificationsEnabled={this.state.notificationsEnabled}
            onNotificationsEnabledChanged={this.onNotificationsEnabledChanged}
          />
        )
        break
      case PreferencesTab.Prompts: {
        View = (
          <Prompts
            confirmRepositoryRemoval={this.state.confirmRepositoryRemoval}
            confirmDiscardChanges={this.state.confirmDiscardChanges}
            confirmDiscardChangesPermanently={
              this.state.confirmDiscardChangesPermanently
            }
            confirmDiscardStash={this.state.confirmDiscardStash}
            confirmCheckoutCommit={this.state.confirmCheckoutCommit}
            confirmForcePush={this.state.confirmForcePush}
            confirmUndoCommit={this.state.confirmUndoCommit}
            onConfirmRepositoryRemovalChanged={
              this.onConfirmRepositoryRemovalChanged
            }
            onConfirmDiscardChangesChanged={this.onConfirmDiscardChangesChanged}
            onConfirmDiscardStashChanged={this.onConfirmDiscardStashChanged}
            onConfirmCheckoutCommitChanged={this.onConfirmCheckoutCommitChanged}
            onConfirmForcePushChanged={this.onConfirmForcePushChanged}
            onConfirmDiscardChangesPermanentlyChanged={
              this.onConfirmDiscardChangesPermanentlyChanged
            }
            onConfirmUndoCommitChanged={this.onConfirmUndoCommitChanged}
            uncommittedChangesStrategy={this.state.uncommittedChangesStrategy}
            onUncommittedChangesStrategyChanged={
              this.onUncommittedChangesStrategyChanged
            }
            showCommitLengthWarning={this.state.showCommitLengthWarning}
            onShowCommitLengthWarningChanged={
              this.onShowCommitLengthWarningChanged
            }
          />
        )
        break
      }
      case PreferencesTab.Advanced: {
        View = (
          <Advanced
            useWindowsOpenSSH={this.state.useWindowsOpenSSH}
            optOutOfUsageTracking={this.state.optOutOfUsageTracking}
            useExternalCredentialHelper={this.state.useExternalCredentialHelper}
            repositoryIndicatorsEnabled={this.state.repositoryIndicatorsEnabled}
            onUseWindowsOpenSSHChanged={this.onUseWindowsOpenSSHChanged}
            onOptOutofReportingChanged={this.onOptOutofReportingChanged}
            onUseExternalCredentialHelperChanged={
              this.onUseExternalCredentialHelperChanged
            }
            onRepositoryIndicatorsEnabledChanged={
              this.onRepositoryIndicatorsEnabledChanged
            }
          />
        )
        break
      }
      case PreferencesTab.Accessibility:
        View = (
          <Accessibility
            underlineLinks={this.state.underlineLinks}
            showDiffCheckMarks={this.state.showDiffCheckMarks}
            onShowDiffCheckMarksChanged={this.onShowDiffCheckMarksChanged}
            onUnderlineLinksChanged={this.onUnderlineLinksChanged}
          />
        )
        break
      default:
        return assertNever(index, `Unknown tab index: ${index}`)
    }

    return (
      <div
        className="tab-container"
        role="tabpanel"
        aria-labelledby={this.getTabId(index)}
      >
        {View}
      </div>
    )
  }

  private onRepositoryIndicatorsEnabledChanged = (
    repositoryIndicatorsEnabled: boolean
  ) => {
    this.setState({ repositoryIndicatorsEnabled })
  }

  private onLockFileDeleted = () => {
    this.setState({ existingLockFilePath: undefined })
  }

  private onLockFileDeleteError = (e: Error) => {
    this.props.dispatcher.postError(e)
  }

  private onUseWindowsOpenSSHChanged = (useWindowsOpenSSH: boolean) => {
    this.setState({ useWindowsOpenSSH })
  }

  private onShowCommitLengthWarningChanged = (
    showCommitLengthWarning: boolean
  ) => {
    this.setState({ showCommitLengthWarning })
  }

  private onNotificationsEnabledChanged = (notificationsEnabled: boolean) => {
    this.setState({ notificationsEnabled })
  }

  private onOptOutofReportingChanged = (value: boolean) => {
    this.setState({ optOutOfUsageTracking: value })
  }

  private onUseExternalCredentialHelperChanged = (value: boolean) => {
    this.setState({ useExternalCredentialHelper: value })
  }

  private onConfirmRepositoryRemovalChanged = (value: boolean) => {
    this.setState({ confirmRepositoryRemoval: value })
  }

  private onConfirmDiscardChangesChanged = (value: boolean) => {
    this.setState({ confirmDiscardChanges: value })
  }

  private onConfirmDiscardStashChanged = (value: boolean) => {
    this.setState({ confirmDiscardStash: value })
  }

  private onConfirmCheckoutCommitChanged = (value: boolean) => {
    this.setState({ confirmCheckoutCommit: value })
  }

  private onConfirmDiscardChangesPermanentlyChanged = (value: boolean) => {
    this.setState({ confirmDiscardChangesPermanently: value })
  }

  private onConfirmForcePushChanged = (value: boolean) => {
    this.setState({ confirmForcePush: value })
  }

  private onConfirmUndoCommitChanged = (value: boolean) => {
    this.setState({ confirmUndoCommit: value })
  }

  private onUncommittedChangesStrategyChanged = (
    uncommittedChangesStrategy: UncommittedChangesStrategy
  ) => {
    this.setState({ uncommittedChangesStrategy })
  }

  private onCommitterNameChanged = (committerName: string) => {
    this.setState({
      committerName,
      disallowedCharactersMessage: gitAuthorNameIsValid(committerName)
        ? null
        : InvalidGitAuthorNameMessage,
    })
  }

  private onCommitterEmailChanged = (committerEmail: string) => {
    this.setState({ committerEmail })
  }

  private onDefaultBranchChanged = (defaultBranch: string) => {
    this.setState({ defaultBranch })
  }

  private onSelectedEditorChanged = (editor: string) => {
    this.setState({ selectedExternalEditor: editor })
  }

  private onSelectedShellChanged = (shell: Shell) => {
    this.setState({ selectedShell: shell })
  }

  private onUseCustomEditorChanged = (useCustomEditor: boolean) => {
    this.setState({ useCustomEditor })
  }

  private onCustomEditorChanged = (customEditor: ICustomIntegration) => {
    this.setState({ customEditor })
  }

  private onUseCustomShellChanged = (useCustomShell: boolean) => {
    this.setState({ useCustomShell })
  }

  private onCustomShellChanged = (customShell: ICustomIntegration) => {
    this.setState({ customShell })
  }

  private onSelectedThemeChanged = (theme: ApplicationTheme) => {
    this.props.dispatcher.setSelectedTheme(theme)
  }

  private onUnderlineLinksChanged = (underlineLinks: boolean) => {
    this.setState({ underlineLinks })
  }

  private onShowDiffCheckMarksChanged = (showDiffCheckMarks: boolean) => {
    this.setState({ showDiffCheckMarks })
  }

  private onSelectedTabSizeChanged = (tabSize: number) => {
    this.props.dispatcher.setSelectedTabSize(tabSize)
  }

  private renderFooter() {
    const hasDisabledError = this.state.disallowedCharactersMessage != null

    return (
      <DialogFooter>
        <OkCancelButtonGroup
          okButtonText="Save"
          okButtonDisabled={hasDisabledError}
        />
      </DialogFooter>
    )
  }

  private onSave = async () => {
    const { dispatcher } = this.props

    try {
      let shouldRefreshAuthor = false

      if (this.state.committerName !== this.state.initialCommitterName) {
        await setGlobalConfigValue('user.name', this.state.committerName)
        shouldRefreshAuthor = true
      }

      if (this.state.committerEmail !== this.state.initialCommitterEmail) {
        await setGlobalConfigValue('user.email', this.state.committerEmail)
        shouldRefreshAuthor = true
      }

      if (this.props.repository !== null && shouldRefreshAuthor) {
        dispatcher.refreshAuthor(this.props.repository)
      }

      // If the entered default branch is empty, we don't store it and keep
      // the previous value.
      // We do this because the preferences dialog doesn't have error states,
      // and since the preferences dialog have a global "Save" button (that will
      // save all the changes performed in every single tab), we cannot
      // block the user from clicking "Save" because the entered branch is not valid
      // (they will not be able to know the issue if they are in a different tab).
      if (
        this.state.defaultBranch.length > 0 &&
        this.state.defaultBranch !== this.state.initialDefaultBranch
      ) {
        await setDefaultBranch(this.state.defaultBranch)
      }

      if (
        this.props.repositoryIndicatorsEnabled !==
        this.state.repositoryIndicatorsEnabled
      ) {
        dispatcher.setRepositoryIndicatorsEnabled(
          this.state.repositoryIndicatorsEnabled
        )
      }
    } catch (e) {
      if (isConfigFileLockError(e)) {
        const lockFilePath = parseConfigLockFilePathFromError(e.result)

        if (lockFilePath !== null) {
          this.setState({
            existingLockFilePath: lockFilePath,
            selectedIndex: PreferencesTab.Git,
          })
          return
        }
      }

      this.props.onDismissed()
      dispatcher.postError(e)
      return
    }

    dispatcher.setUseWindowsOpenSSH(this.state.useWindowsOpenSSH)
    dispatcher.setShowCommitLengthWarning(this.state.showCommitLengthWarning)
    dispatcher.setNotificationsEnabled(this.state.notificationsEnabled)

    await dispatcher.setStatsOptOut(this.state.optOutOfUsageTracking, false)

    const { useCustomEditor, customEditor, useCustomShell, customShell } =
      this.state

    const isValidCustomEditor =
      customEditor && (await isValidCustomIntegration(customEditor))
    dispatcher.setUseCustomEditor(useCustomEditor && isValidCustomEditor)
    if (isValidCustomEditor) {
      dispatcher.setCustomEditor(customEditor)
    }

    const isValidCustomShell =
      customShell && (await isValidCustomIntegration(customShell))
    dispatcher.setUseCustomShell(useCustomShell && isValidCustomShell)
    if (isValidCustomShell) {
      dispatcher.setCustomShell(customShell)
    }

    if (enableExternalCredentialHelper()) {
      if (
        this.props.useExternalCredentialHelper !==
        this.state.useExternalCredentialHelper
      ) {
        dispatcher.setUseExternalCredentialHelper(
          this.state.useExternalCredentialHelper
        )
      }
    }

    await dispatcher.setConfirmRepoRemovalSetting(
      this.state.confirmRepositoryRemoval
    )

    await dispatcher.setConfirmForcePushSetting(this.state.confirmForcePush)

    await dispatcher.setConfirmDiscardStashSetting(
      this.state.confirmDiscardStash
    )

    await dispatcher.setConfirmCheckoutCommitSetting(
      this.state.confirmCheckoutCommit
    )

    await dispatcher.setConfirmUndoCommitSetting(this.state.confirmUndoCommit)

    if (this.state.selectedExternalEditor) {
      await dispatcher.setExternalEditor(this.state.selectedExternalEditor)
    }
    await dispatcher.setShell(this.state.selectedShell)
    await dispatcher.setConfirmDiscardChangesSetting(
      this.state.confirmDiscardChanges
    )
    await dispatcher.setConfirmDiscardChangesPermanentlySetting(
      this.state.confirmDiscardChangesPermanently
    )

    await dispatcher.setUncommittedChangesStrategySetting(
      this.state.uncommittedChangesStrategy
    )

    dispatcher.setUnderlineLinksSetting(this.state.underlineLinks)

    dispatcher.setDiffCheckMarksSetting(this.state.showDiffCheckMarks)

    this.props.onDismissed()
  }

  private onTabClicked = (index: number) => {
    this.setState({ selectedIndex: index })
  }
}
