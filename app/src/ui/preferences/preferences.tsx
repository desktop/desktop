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
import { lookupPreferredEmail } from '../../lib/email'
import { Shell, getAvailableShells } from '../../lib/shells'
import { getAvailableEditors } from '../../lib/editors/lookup'
import { gitAuthorNameIsValid } from '../lib/identifier-rules'
import { Appearance } from './appearance'
import { ApplicationTheme } from '../lib/application-theme'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Integrations } from './integrations'
import {
  UncommittedChangesStrategy,
  defaultUncommittedChangesStrategy,
} from '../../models/uncommitted-changes-strategy'
import { Octicon, OcticonSymbol } from '../octicons'
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

interface IPreferencesProps {
  readonly dispatcher: Dispatcher
  readonly dotComAccount: Account | null
  readonly enterpriseAccount: Account | null
  readonly repository: Repository | null
  readonly onDismissed: () => void
  readonly optOutOfUsageTracking: boolean
  readonly initialSelectedTab?: PreferencesTab
  readonly confirmRepositoryRemoval: boolean
  readonly confirmDiscardChanges: boolean
  readonly confirmForcePush: boolean
  readonly uncommittedChangesStrategy: UncommittedChangesStrategy
  readonly selectedExternalEditor: string | null
  readonly selectedShell: Shell
  readonly selectedTheme: ApplicationTheme
  readonly automaticallySwitchTheme: boolean
  readonly repositoryIndicatorsEnabled: boolean
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
  readonly optOutOfUsageTracking: boolean
  readonly confirmRepositoryRemoval: boolean
  readonly confirmDiscardChanges: boolean
  readonly confirmForcePush: boolean
  readonly uncommittedChangesStrategy: UncommittedChangesStrategy
  readonly availableEditors: ReadonlyArray<string>
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
      optOutOfUsageTracking: false,
      confirmRepositoryRemoval: false,
      confirmDiscardChanges: false,
      confirmForcePush: false,
      uncommittedChangesStrategy: defaultUncommittedChangesStrategy,
      selectedExternalEditor: this.props.selectedExternalEditor,
      availableShells: [],
      selectedShell: this.props.selectedShell,
      repositoryIndicatorsEnabled: this.props.repositoryIndicatorsEnabled,
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

    const availableEditors = editors.map(e => e.editor)
    const availableShells = shells.map(e => e.shell)

    this.setState({
      committerName,
      committerEmail,
      defaultBranch: initialDefaultBranch,
      initialCommitterName,
      initialCommitterEmail,
      initialDefaultBranch,
      optOutOfUsageTracking: this.props.optOutOfUsageTracking,
      confirmRepositoryRemoval: this.props.confirmRepositoryRemoval,
      confirmDiscardChanges: this.props.confirmDiscardChanges,
      confirmForcePush: this.props.confirmForcePush,
      uncommittedChangesStrategy: this.props.uncommittedChangesStrategy,
      availableShells,
      availableEditors,
    })
  }

  public render() {
    return (
      <Dialog
        id="preferences"
        title={__DARWIN__ ? 'Preferences' : 'Options'}
        onDismissed={this.props.onDismissed}
        onSubmit={this.onSave}
      >
        <div className="preferences-container">
          {this.renderDisallowedCharactersError()}
          <TabBar
            onTabClicked={this.onTabClicked}
            selectedIndex={this.state.selectedIndex}
            type={TabBarType.Vertical}
          >
            <span>
              <Octicon className="icon" symbol={OcticonSymbol.home} />
              Accounts
            </span>
            <span>
              <Octicon className="icon" symbol={OcticonSymbol.person} />
              Integrations
            </span>
            <span>
              <Octicon className="icon" symbol={OcticonSymbol.gitCommit} />
              Git
            </span>
            <span>
              <Octicon className="icon" symbol={OcticonSymbol.paintbrush} />
              Appearance
            </span>
            <span>
              <Octicon className="icon" symbol={OcticonSymbol.question} />
              Prompts
            </span>
            <span>
              <Octicon className="icon" symbol={OcticonSymbol.settings} />
              Advanced
            </span>
          </TabBar>

          {this.renderActiveTab()}
        </div>
        {this.renderFooter()}
      </Dialog>
    )
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
            onSelectedShellChanged={this.onSelectedShellChanged}
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
            automaticallySwitchTheme={this.props.automaticallySwitchTheme}
            onAutomaticallySwitchThemeChanged={
              this.onAutomaticallySwitchThemeChanged
            }
          />
        )
        break
      case PreferencesTab.Prompts: {
        View = (
          <Prompts
            confirmRepositoryRemoval={this.state.confirmRepositoryRemoval}
            confirmDiscardChanges={this.state.confirmDiscardChanges}
            confirmForcePush={this.state.confirmForcePush}
            onConfirmRepositoryRemovalChanged={
              this.onConfirmRepositoryRemovalChanged
            }
            onConfirmDiscardChangesChanged={this.onConfirmDiscardChangesChanged}
            onConfirmForcePushChanged={this.onConfirmForcePushChanged}
          />
        )
        break
      }
      case PreferencesTab.Advanced: {
        View = (
          <Advanced
            optOutOfUsageTracking={this.state.optOutOfUsageTracking}
            repositoryIndicatorsEnabled={this.state.repositoryIndicatorsEnabled}
            uncommittedChangesStrategy={this.state.uncommittedChangesStrategy}
            onOptOutofReportingchanged={this.onOptOutofReportingChanged}
            onUncommittedChangesStrategyChanged={
              this.onUncommittedChangesStrategyChanged
            }
            onRepositoryIndicatorsEnabledChanged={
              this.onRepositoryIndicatorsEnabledChanged
            }
          />
        )
        break
      }
      default:
        return assertNever(index, `Unknown tab index: ${index}`)
    }

    return <div className="tab-container">{View}</div>
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

  private onOptOutofReportingChanged = (value: boolean) => {
    this.setState({ optOutOfUsageTracking: value })
  }

  private onConfirmRepositoryRemovalChanged = (value: boolean) => {
    this.setState({ confirmRepositoryRemoval: value })
  }

  private onConfirmDiscardChangesChanged = (value: boolean) => {
    this.setState({ confirmDiscardChanges: value })
  }

  private onConfirmForcePushChanged = (value: boolean) => {
    this.setState({ confirmForcePush: value })
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
        : 'Name is invalid, it consists only of disallowed characters.',
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

  private onSelectedThemeChanged = (theme: ApplicationTheme) => {
    this.props.dispatcher.setSelectedTheme(theme)
  }

  private onAutomaticallySwitchThemeChanged = (
    automaticallySwitchTheme: boolean
  ) => {
    this.props.dispatcher.onAutomaticallySwitchThemeChanged(
      automaticallySwitchTheme
    )
  }

  private renderFooter() {
    const hasDisabledError = this.state.disallowedCharactersMessage != null

    const index = this.state.selectedIndex
    switch (index) {
      case PreferencesTab.Accounts:
      case PreferencesTab.Appearance:
        return null
      case PreferencesTab.Integrations:
      case PreferencesTab.Advanced:
      case PreferencesTab.Prompts:
      case PreferencesTab.Git: {
        return (
          <DialogFooter>
            <OkCancelButtonGroup
              okButtonText="Save"
              okButtonDisabled={hasDisabledError}
            />
          </DialogFooter>
        )
      }
      default:
        return assertNever(index, `Unknown tab index: ${index}`)
    }
  }

  private onSave = async () => {
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
        this.props.dispatcher.refreshAuthor(this.props.repository)
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
        this.props.dispatcher.setRepositoryIndicatorsEnabled(
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
      this.props.dispatcher.postError(e)
      return
    }

    await this.props.dispatcher.setStatsOptOut(
      this.state.optOutOfUsageTracking,
      false
    )
    await this.props.dispatcher.setConfirmRepoRemovalSetting(
      this.state.confirmRepositoryRemoval
    )

    await this.props.dispatcher.setConfirmForcePushSetting(
      this.state.confirmForcePush
    )

    if (this.state.selectedExternalEditor) {
      await this.props.dispatcher.setExternalEditor(
        this.state.selectedExternalEditor
      )
    }
    await this.props.dispatcher.setShell(this.state.selectedShell)
    await this.props.dispatcher.setConfirmDiscardChangesSetting(
      this.state.confirmDiscardChanges
    )

    await this.props.dispatcher.setUncommittedChangesStrategySetting(
      this.state.uncommittedChangesStrategy
    )

    this.props.onDismissed()
  }

  private onTabClicked = (index: number) => {
    this.setState({ selectedIndex: index })
  }
}
