import * as React from 'react'
import { Account } from '../../models/account'
import { PreferencesTab } from '../../models/preferences'
import { ExternalEditor } from '../../lib/editors'
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
  getGlobalBooleanConfigValue,
} from '../../lib/git/config'
import { lookupPreferredEmail } from '../../lib/email'
import { Shell, getAvailableShells } from '../../lib/shells'
import { getAvailableEditors } from '../../lib/editors/lookup'
import { gitAuthorNameIsValid } from './identifier-rules'
import { Appearance } from './appearance'
import { ApplicationTheme } from '../lib/application-theme'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Integrations } from './integrations'
import {
  UncommittedChangesStrategyKind,
  uncommittedChangesStrategyKindDefault,
} from '../../models/uncommitted-changes-strategy'
import { Octicon, OcticonSymbol } from '../octicons'
import {
  isConfigFileLockError,
  parseConfigLockFilePathFromError,
} from '../../lib/git'
import { ConfigLockFileExists } from '../lib/config-lock-file-exists'

interface IPreferencesProps {
  readonly dispatcher: Dispatcher
  readonly dotComAccount: Account | null
  readonly enterpriseAccount: Account | null
  readonly onDismissed: () => void
  readonly optOutOfUsageTracking: boolean
  readonly initialSelectedTab?: PreferencesTab
  readonly confirmRepositoryRemoval: boolean
  readonly confirmDiscardChanges: boolean
  readonly confirmForcePush: boolean
  readonly uncommittedChangesStrategyKind: UncommittedChangesStrategyKind
  readonly selectedExternalEditor: ExternalEditor | null
  readonly selectedShell: Shell
  readonly selectedTheme: ApplicationTheme
  readonly automaticallySwitchTheme: boolean
}

interface IPreferencesState {
  readonly selectedIndex: PreferencesTab
  readonly committerName: string
  readonly committerEmail: string
  readonly initialCommitterName: string | null
  readonly initialCommitterEmail: string | null
  readonly disallowedCharactersMessage: string | null
  readonly optOutOfUsageTracking: boolean
  readonly confirmRepositoryRemoval: boolean
  readonly confirmDiscardChanges: boolean
  readonly confirmForcePush: boolean
  readonly automaticallySwitchTheme: boolean
  readonly uncommittedChangesStrategyKind: UncommittedChangesStrategyKind
  readonly availableEditors: ReadonlyArray<ExternalEditor>
  readonly selectedExternalEditor: ExternalEditor | null
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
  readonly initialSchannelCheckRevoke: boolean | null
  readonly schannelCheckRevoke: boolean | null
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
      initialCommitterName: null,
      initialCommitterEmail: null,
      disallowedCharactersMessage: null,
      availableEditors: [],
      optOutOfUsageTracking: false,
      confirmRepositoryRemoval: false,
      confirmDiscardChanges: false,
      confirmForcePush: false,
      uncommittedChangesStrategyKind: uncommittedChangesStrategyKindDefault,
      automaticallySwitchTheme: false,
      selectedExternalEditor: this.props.selectedExternalEditor,
      availableShells: [],
      selectedShell: this.props.selectedShell,
      initialSchannelCheckRevoke: null,
      schannelCheckRevoke: null,
    }
  }

  public async componentWillMount() {
    const initialCommitterName = await getGlobalConfigValue('user.name')
    const initialCommitterEmail = await getGlobalConfigValue('user.email')

    // There's no point in us reading http.schannelCheckRevoke on macOS, it's
    // just a wasted Git process since the option only affects Windows. Besides,
    // the checkbox will not be visible unless running on Windows so we'll just
    // default to the default value for lack of anything better.
    const initialSchannelCheckRevoke = __WIN32__
      ? await getGlobalBooleanConfigValue('http.schannelCheckRevoke')
      : null

    let committerName = initialCommitterName
    let committerEmail = initialCommitterEmail

    if (!committerName || !committerEmail) {
      const account = this.props.dotComAccount || this.props.enterpriseAccount

      if (account) {
        if (!committerName) {
          committerName = account.login
        }

        if (!committerEmail) {
          const found = lookupPreferredEmail(account)
          if (found) {
            committerEmail = found.email
          }
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
      initialCommitterName,
      initialCommitterEmail,
      optOutOfUsageTracking: this.props.optOutOfUsageTracking,
      confirmRepositoryRemoval: this.props.confirmRepositoryRemoval,
      confirmDiscardChanges: this.props.confirmDiscardChanges,
      confirmForcePush: this.props.confirmForcePush,
      uncommittedChangesStrategyKind: this.props.uncommittedChangesStrategyKind,
      availableShells,
      availableEditors,
      initialSchannelCheckRevoke,
      schannelCheckRevoke: initialSchannelCheckRevoke,
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
              <Octicon className="icon" symbol={OcticonSymbol.paintcan} />
              Appearance
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
              onNameChanged={this.onCommitterNameChanged}
              onEmailChanged={this.onCommitterEmailChanged}
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
      case PreferencesTab.Advanced: {
        View = (
          <Advanced
            optOutOfUsageTracking={this.state.optOutOfUsageTracking}
            confirmRepositoryRemoval={this.state.confirmRepositoryRemoval}
            confirmDiscardChanges={this.state.confirmDiscardChanges}
            confirmForcePush={this.state.confirmForcePush}
            uncommittedChangesStrategyKind={
              this.state.uncommittedChangesStrategyKind
            }
            onOptOutofReportingchanged={this.onOptOutofReportingChanged}
            onConfirmRepositoryRemovalChanged={
              this.onConfirmRepositoryRemovalChanged
            }
            onConfirmDiscardChangesChanged={this.onConfirmDiscardChangesChanged}
            onConfirmForcePushChanged={this.onConfirmForcePushChanged}
            onUncommittedChangesStrategyKindChanged={
              this.onUncommittedChangesStrategyKindChanged
            }
            schannelCheckRevoke={this.state.schannelCheckRevoke}
            onSchannelCheckRevokeChanged={this.onSchannelCheckRevokeChanged}
          />
        )
        break
      }
      default:
        return assertNever(index, `Unknown tab index: ${index}`)
    }

    return <div className="tab-container">{View}</div>
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

  private onUncommittedChangesStrategyKindChanged = (
    value: UncommittedChangesStrategyKind
  ) => {
    this.setState({ uncommittedChangesStrategyKind: value })
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

  private onSelectedEditorChanged = (editor: ExternalEditor) => {
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

  private onSchannelCheckRevokeChanged = (value: boolean) => {
    this.setState({ schannelCheckRevoke: value })
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
      if (this.state.committerName !== this.state.initialCommitterName) {
        await setGlobalConfigValue('user.name', this.state.committerName)
      }

      if (this.state.committerEmail !== this.state.initialCommitterEmail) {
        await setGlobalConfigValue('user.email', this.state.committerEmail)
      }

      if (
        this.state.schannelCheckRevoke !==
          this.state.initialSchannelCheckRevoke &&
        this.state.schannelCheckRevoke !== null &&
        __WIN32__
      ) {
        await setGlobalConfigValue(
          'http.schannelCheckRevoke',
          this.state.schannelCheckRevoke.toString()
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

    await this.props.dispatcher.setUncommittedChangesStrategyKindSetting(
      this.state.uncommittedChangesStrategyKind
    )

    this.props.onDismissed()
  }

  private onTabClicked = (index: number) => {
    this.setState({ selectedIndex: index })
  }
}
