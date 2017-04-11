import * as React from 'react'
import { Account } from '../../models/account'
import { Dispatcher } from '../../lib/dispatcher'
import { TabBar } from '../tab-bar'
import { Accounts } from './accounts'
import { Git } from './git'
import { assertNever } from '../../lib/fatal-error'
import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { Dialog, DialogFooter } from '../dialog'
import { getGlobalConfigValue, setGlobalConfigValue } from '../../lib/git/config'

interface IPreferencesProps {
  readonly dispatcher: Dispatcher
  readonly dotComAccount: Account | null
  readonly enterpriseAccount: Account | null
  readonly onDismissed: () => void
}

enum PreferencesTab {
  Accounts = 0,
  Git
}

interface IPreferencesState {
  readonly selectedIndex: PreferencesTab
  readonly committerName: string,
  readonly committerEmail: string
}

/** The app-level preferences component. */
export class Preferences extends React.Component<IPreferencesProps, IPreferencesState> {
  public constructor(props: IPreferencesProps) {
    super(props)

    this.state = {
      selectedIndex: PreferencesTab.Accounts,
      committerName: '',
      committerEmail: '',
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

        if (!committerEmail && account.emails.length) {
          committerEmail = account.emails[0].email
        }
      }
    }

    committerName = committerName || ''
    committerEmail = committerEmail || ''

    this.setState({ committerName, committerEmail })
  }

  public render() {
    return (
      <Dialog
        id='preferences'
        title={__DARWIN__ ? 'Preferences' : 'Options'}
        onDismissed={this.props.onDismissed}
        onSubmit={this.onSave}
      >
        <TabBar onTabClicked={this.onTabClicked} selectedIndex={this.state.selectedIndex}>
          <span>Accounts</span>
          <span>Git</span>
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

  private renderActiveTab() {
    const index = this.state.selectedIndex
    switch (index) {
      case PreferencesTab.Accounts:
        return <Accounts
          dotComAccount={this.props.dotComAccount}
          enterpriseAccount={this.props.enterpriseAccount}
          onDotComSignIn={this.onDotComSignIn}
          onEnterpriseSignIn={this.onEnterpriseSignIn}
          onLogout={this.onLogout}
        />
      case PreferencesTab.Git: {
        return <Git
          name={this.state.committerName}
          email={this.state.committerEmail}
          onNameChanged={this.onCommitterNameChanged}
          onEmailChanged={this.onCommitterEmailChanged}
        />
      }
      default: return assertNever(index, `Unknown tab index: ${index}`)
    }
  }

  private onCommitterNameChanged = (committerName: string) => {
    this.setState({ committerName })
  }


  private onCommitterEmailChanged = (committerEmail: string) => {
    this.setState({ committerEmail })
  }

  private renderFooter() {
    const index = this.state.selectedIndex
    switch (index) {
      case PreferencesTab.Accounts: return null
      case PreferencesTab.Git: {
        return (
          <DialogFooter>
            <ButtonGroup>
              <Button type='submit'>Save</Button>
              <Button onClick={this.props.onDismissed}>Cancel</Button>
            </ButtonGroup>
          </DialogFooter>
        )
      }
      default: return assertNever(index, `Unknown tab index: ${index}`)
    }
  }

  private onSave = async () => {
    await setGlobalConfigValue('user.name', this.state.committerName)
    await setGlobalConfigValue('user.email', this.state.committerEmail)

    this.props.onDismissed()
  }

  private onTabClicked = (index: number) => {
    this.setState({ selectedIndex: index })
  }
}
