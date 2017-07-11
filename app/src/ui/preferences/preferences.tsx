import * as React from 'react'
import { Account } from '../../models/account'
import { Dispatcher } from '../../lib/dispatcher'
import { TabBar } from '../tab-bar'
import { Accounts } from './accounts'
import { Advanced } from './advanced'
import { Git } from './git'
import { FileTypeList, IFileTypeItem } from './filetypes'
import { assertNever } from '../../lib/fatal-error'
import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { Dialog, DialogFooter } from '../dialog'
import { getGlobalConfigValue, setGlobalConfigValue } from '../../lib/git/config'
import { lookupPreferredEmail } from '../../lib/email'
import { IEditorInfo } from '../../lib/dispatcher/app-shell'

interface IPreferencesProps {
  readonly dispatcher: Dispatcher
  readonly dotComAccount: Account | null
  readonly enterpriseAccount: Account | null
  readonly onDismissed: () => void
  readonly optOutOfUsageTracking: boolean
  readonly confirmRepoRemoval: boolean
}

enum PreferencesTab {
  Accounts = 0,
  FileTypes,
  Git,
  Advanced,
}

interface IPreferencesState {
  readonly selectedIndex: PreferencesTab
  readonly committerName: string
  readonly committerEmail: string
  readonly isOptedOut: boolean
  readonly confirmRepoRemoval: boolean
}

/** The app-level preferences component. */
export class Preferences extends React.Component<IPreferencesProps, IPreferencesState> {

  private fileTypes: Array<IFileTypeItem> | null

  public constructor(props: IPreferencesProps) {
    super(props)

    this.state = {
      selectedIndex: PreferencesTab.Accounts,
      committerName: '',
      committerEmail: '',
      isOptedOut: false,
      confirmRepoRemoval: false,
    }
  }

  public async componentWillMount() {
    const isOptedOut = this.props.optOutOfUsageTracking
    const confirmRepoRemoval = this.props.confirmRepoRemoval

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

    committerName = committerName || ''
    committerEmail = committerEmail || ''

    this.setState({ committerName, committerEmail, isOptedOut, confirmRepoRemoval })
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
          <span>File Types</span>
          <span>Git</span>
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
      case PreferencesTab.Advanced: {
        return <Advanced
          isOptedOut={this.state.isOptedOut}
          confirmRepoRemoval={this.state.confirmRepoRemoval}
          onOptOutSet={this.onOptOutSet}
          onConfirmRepoRemovalSet={this.onConfirmRepoRemovalSet}
        />
      }
      case PreferencesTab.FileTypes: {

        if (this.fileTypes == null)
        {
          const result = new Array<IFileTypeItem>()
          for (const o in localStorage) {
            if ( o.startsWith('external-editors-')) {
              const raw = localStorage[o]
              const editors: ReadonlyArray<IEditorInfo> = JSON.parse(raw)
              for (const e of editors) {
                result.push( {
                  id: e.name,
                  text: o.substring(17),
                  extension: o.substring(17),
                  cmd: e.cmd,
                })
              }
            }
          }

          this.fileTypes = result
        }
        return <FileTypeList
        allTypes={this.fileTypes}
        selectedType={''}
        />
      }
      default: return assertNever(index, `Unknown tab index: ${index}`)
    }
  }

  private onOptOutSet = (isOptedOut: boolean) => {
    this.setState({ isOptedOut })
  }

  private onConfirmRepoRemovalSet = (confirmRepoRemoval: boolean) => {
    this.setState({ confirmRepoRemoval })
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
      case PreferencesTab.Advanced:
      case PreferencesTab.FileTypes:
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
    await this.props.dispatcher.setStatsOptOut(this.state.isOptedOut)
    await this.props.dispatcher.setConfirmRepoRemovalSetting(this.state.confirmRepoRemoval)

    console.log( this.fileTypes)
    this.props.onDismissed()
  }

  private onTabClicked = (index: number) => {
    this.setState({ selectedIndex: index })
  }
}
