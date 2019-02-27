import * as React from 'react'
import { Account } from '../../models/account'
import { PreferencesTab } from '../../models/preferences'
import { ExternalEditor } from '../../lib/editors'
import { Dispatcher } from '../dispatcher'
import { TabBar } from '../tab-bar'
import { Accounts } from './accounts'
import { Advanced } from './advanced'
import { Git } from './git'
import { assertNever } from '../../lib/fatal-error'
import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { Dialog, DialogFooter, DialogError } from '../dialog'
import {
  getGlobalConfigValue,
  setGlobalConfigValue,
  getMergeTool,
  IMergeTool,
} from '../../lib/git/config'
import { lookupPreferredEmail } from '../../lib/email'
import { Shell, getAvailableShells } from '../../lib/shells'
import { getAvailableEditors } from '../../lib/editors/lookup'
import { disallowedCharacters } from './identifier-rules'
import { Appearance } from './appearance'
import { ApplicationTheme } from '../lib/application-theme'

interface IPreferencesProps {
  readonly dispatcher: Dispatcher
  readonly dotComAccount: Account | null
  readonly enterpriseAccount: Account | null
  readonly onDismissed: () => void
  readonly optOutOfUsageTracking: boolean
  readonly initialSelectedTab?: PreferencesTab
  readonly confirmRepositoryRemoval: boolean
  readonly confirmDiscardChanges: boolean
  readonly selectedExternalEditor?: ExternalEditor
  readonly selectedShell: Shell
  readonly selectedTheme: ApplicationTheme
  readonly automaticallySwitchTheme: boolean
}

interface IPreferencesState {
  readonly selectedIndex: PreferencesTab
  readonly committerName: string
  readonly committerEmail: string
  readonly disallowedCharactersMessage: string | null
  readonly optOutOfUsageTracking: boolean
  readonly confirmRepositoryRemoval: boolean
  readonly confirmDiscardChanges: boolean
  readonly automaticallySwitchTheme: boolean
  readonly availableEditors: ReadonlyArray<ExternalEditor>
  readonly selectedExternalEditor?: ExternalEditor
  readonly availableShells: ReadonlyArray<Shell>
  readonly selectedShell: Shell
  readonly mergeTool: IMergeTool | null
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
      disallowedCharactersMessage: null,
      availableEditors: [],
      optOutOfUsageTracking: props.optOutOfUsageTracking,
      confirmRepositoryRemoval: props.confirmRepositoryRemoval,
      confirmDiscardChanges: props.confirmDiscardChanges,
      automaticallySwitchTheme: false,
      selectedExternalEditor: this.props.selectedExternalEditor,
      availableShells: [],
      selectedShell: this.props.selectedShell,
      mergeTool: null,
    }
  }

  public async componentWillMount() {
    let committerName = await getGlobalConfigValue('user.name')
    let committerEmail = await getGlobalConfigValue('user.email')

    if (!committerName || !committerEmail) {
      const account = this.props.dotComAccount || this.props.enterpriseAccount

      if (account) {
        if (!committerName) {
          committerName = account.login
        }

        if (!committerEmail) {
          const found = lookupPreferredEmail(account.emails)
          if (found) {
            committerEmail = found.email
          }
        }
      }
    }

    const [editors, shells, mergeTool] = await Promise.all([
      getAvailableEditors(),
      getAvailableShells(),
      getMergeTool(),
    ])

    const availableEditors = editors.map(e => e.editor)
    const availableShells = shells.map(e => e.shell)

    this.setState((_, props) => ({
      committerName: committerName || '',
      committerEmail: committerEmail || '',
      optOutOfUsageTracking: props.optOutOfUsageTracking,
      confirmRepositoryRemoval: props.confirmRepositoryRemoval,
      confirmDiscardChanges: props.confirmDiscardChanges,
      availableShells,
      availableEditors,
      mergeTool,
    }))
  }

  public render() {
    return (
      <Dialog
        id="preferences"
        title={__DARWIN__ ? 'Preferences' : 'Options'}
        onDismissed={this.props.onDismissed}
        onSubmit={this.onSave}
      >
        {this.renderDisallowedCharactersError()}
        <TabBar
          onTabClicked={this.onTabClicked}
          selectedIndex={this.state.selectedIndex}
        >
          <span>Accounts</span>
          <span>Git</span>
          <span>Appearance</span>
          <span>Advanced</span>
        </TabBar>

        {this.renderActiveTab()}
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

  private disallowedCharacterErrorMessage(name: string, email: string) {
    const disallowedNameCharacters = disallowedCharacters(name)
    if (disallowedNameCharacters != null) {
      return `Git name field cannot be a disallowed character "${disallowedNameCharacters}"`
    }

    const disallowedEmailCharacters = disallowedCharacters(email)
    if (disallowedEmailCharacters != null) {
      return `Git email field cannot be a disallowed character "${disallowedEmailCharacters}"`
    }

    return null
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
    switch (index) {
      case PreferencesTab.Accounts:
        return (
          <Accounts
            dotComAccount={this.props.dotComAccount}
            enterpriseAccount={this.props.enterpriseAccount}
            onDotComSignIn={this.onDotComSignIn}
            onEnterpriseSignIn={this.onEnterpriseSignIn}
            onLogout={this.onLogout}
          />
        )
      case PreferencesTab.Git: {
        return (
          <Git
            name={this.state.committerName}
            email={this.state.committerEmail}
            onNameChanged={this.onCommitterNameChanged}
            onEmailChanged={this.onCommitterEmailChanged}
          />
        )
      }
      case PreferencesTab.Appearance:
        return (
          <Appearance
            selectedTheme={this.props.selectedTheme}
            onSelectedThemeChanged={this.onSelectedThemeChanged}
            automaticallySwitchTheme={this.props.automaticallySwitchTheme}
            onAutomaticallySwitchThemeChanged={
              this.onAutomaticallySwitchThemeChanged
            }
          />
        )
      case PreferencesTab.Advanced: {
        return (
          <Advanced
            optOutOfUsageTracking={this.state.optOutOfUsageTracking}
            confirmRepositoryRemoval={this.state.confirmRepositoryRemoval}
            confirmDiscardChanges={this.state.confirmDiscardChanges}
            availableEditors={this.state.availableEditors}
            selectedExternalEditor={this.state.selectedExternalEditor}
            onOptOutofReportingchanged={this.onOptOutofReportingChanged}
            onConfirmRepositoryRemovalChanged={
              this.onConfirmRepositoryRemovalChanged
            }
            onConfirmDiscardChangesChanged={this.onConfirmDiscardChangesChanged}
            onSelectedEditorChanged={this.onSelectedEditorChanged}
            availableShells={this.state.availableShells}
            selectedShell={this.state.selectedShell}
            onSelectedShellChanged={this.onSelectedShellChanged}
            mergeTool={this.state.mergeTool}
            onMergeToolCommandChanged={this.onMergeToolCommandChanged}
            onMergeToolNameChanged={this.onMergeToolNameChanged}
          />
        )
      }
      default:
        return assertNever(index, `Unknown tab index: ${index}`)
    }
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

  private onCommitterNameChanged = (committerName: string) => {
    const disallowedCharactersMessage = this.disallowedCharacterErrorMessage(
      committerName,
      this.state.committerEmail
    )

    this.setState({ committerName, disallowedCharactersMessage })
  }

  private onCommitterEmailChanged = (committerEmail: string) => {
    const disallowedCharactersMessage = this.disallowedCharacterErrorMessage(
      this.state.committerName,
      committerEmail
    )

    this.setState({ committerEmail, disallowedCharactersMessage })
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

  private renderFooter() {
    const hasDisabledError = this.state.disallowedCharactersMessage != null

    const index = this.state.selectedIndex
    switch (index) {
      case PreferencesTab.Accounts:
      case PreferencesTab.Appearance:
        return null
      case PreferencesTab.Advanced:
      case PreferencesTab.Git: {
        return (
          <DialogFooter>
            <ButtonGroup>
              <Button type="submit" disabled={hasDisabledError}>
                Save
              </Button>
              <Button onClick={this.props.onDismissed}>Cancel</Button>
            </ButtonGroup>
          </DialogFooter>
        )
      }
      default:
        return assertNever(index, `Unknown tab index: ${index}`)
    }
  }

  private onSave = async () => {
    await setGlobalConfigValue('user.name', this.state.committerName)
    await setGlobalConfigValue('user.email', this.state.committerEmail)
    await this.props.dispatcher.setStatsOptOut(
      this.state.optOutOfUsageTracking,
      false
    )
    await this.props.dispatcher.setConfirmRepoRemovalSetting(
      this.state.confirmRepositoryRemoval
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

    const mergeTool = this.state.mergeTool
    if (mergeTool && mergeTool.name) {
      await setGlobalConfigValue('merge.tool', mergeTool.name)

      if (mergeTool.command) {
        await setGlobalConfigValue(
          `mergetool.${mergeTool.name}.cmd`,
          mergeTool.command
        )
      }
    }

    this.props.onDismissed()
  }

  private onTabClicked = (index: number) => {
    this.setState({ selectedIndex: index })
  }

  private onMergeToolNameChanged = (name: string) => {
    const mergeTool = {
      name,
      command: this.state.mergeTool && this.state.mergeTool.command,
    }
    this.setState({ mergeTool })
  }

  private onMergeToolCommandChanged = (command: string) => {
    const mergeTool = {
      name: this.state.mergeTool ? this.state.mergeTool.name : '',
      command,
    }
    this.setState({ mergeTool })
  }
}
