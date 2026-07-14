import * as React from 'react'
import { PublishRepository } from './publish-repository'
import { Dispatcher } from '../dispatcher'
import {
  Account,
  isDotComAccount,
  isEnterpriseAccount,
} from '../../models/account'
import { Repository } from '../../models/repository'
import { Dialog, DialogFooter, DialogContent, DialogError } from '../dialog'
import { TabBar } from '../tab-bar'
import { assertNever, fatalError } from '../../lib/fatal-error'
import { CallToAction } from '../lib/call-to-action'
import { getGitDescription } from '../../lib/git'
import {
  IDotcomPublicationSettings,
  IEnterprisePublicationSettings,
  RepositoryPublicationSettings,
  PublishSettingsType,
} from '../../models/publish-settings'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import memoizeOne from 'memoize-one'

enum PublishTab {
  DotCom = 0,
  Enterprise,
}

type TabState = IDotcomTabState | IEnterpriseTabState

interface IDotcomTabState {
  readonly kind: 'dotcom'

  /** The settings for publishing the repository. */
  readonly settings: IDotcomPublicationSettings

  /**
   * An error which, if present, is presented to the
   * user in close proximity to the actions or input fields
   * related to the current step.
   */
  readonly error: Error | null
}

interface IEnterpriseTabState {
  readonly kind: 'enterprise'

  /** The settings for publishing the repository. */
  readonly settings: IEnterprisePublicationSettings

  /**
   * An error which, if present, is presented to the
   * user in close proximity to the actions or input fields
   * related to the current step.
   */
  readonly error: Error | null

  readonly selectedAccount: Account | null
}

interface IPublishProps {
  readonly dispatcher: Dispatcher

  /** The repository being published. */
  readonly repository: Repository

  /** The signed in accounts. */
  readonly accounts: ReadonlyArray<Account>

  /** The function to call when the dialog should be dismissed. */
  readonly onDismissed: () => void
}

interface IPublishState {
  /** The currently selected tab. */
  readonly currentTab: PublishTab
  readonly dotcomTabState: IDotcomTabState
  readonly enterpriseTabState: IEnterpriseTabState

  /** Is the repository currently being published? */
  readonly publishing: boolean
}

/**
 * The Publish component.
 */
export class Publish extends React.Component<IPublishProps, IPublishState> {
  private getAccountsForTab = memoizeOne(
    (tab: PublishTab, accounts: ReadonlyArray<Account>) =>
      accounts.filter(
        tab === PublishTab.DotCom ? isDotComAccount : isEnterpriseAccount
      )
  )

  public constructor(props: IPublishProps) {
    super(props)

    const hasDotComAccount = props.accounts.some(isDotComAccount)
    const hasEnterpriseAccount = props.accounts.some(isEnterpriseAccount)
    let startingTab = PublishTab.DotCom
    if (!hasDotComAccount && hasEnterpriseAccount) {
      startingTab = PublishTab.Enterprise
    }

    const publicationSettings = {
      name: props.repository.name,
      description: '',
      private: true,
    }

    const dotcomTabState: IDotcomTabState = {
      kind: 'dotcom',
      settings: {
        ...publicationSettings,
        kind: PublishSettingsType.dotcom,
        org: null,
      },
      error: null,
    }

    const enterpriseTabState: IEnterpriseTabState = {
      kind: 'enterprise',
      settings: {
        ...publicationSettings,
        kind: PublishSettingsType.enterprise,
        org: null,
      },
      error: null,
      selectedAccount: null,
    }

    this.state = {
      currentTab: startingTab,
      dotcomTabState,
      enterpriseTabState,
      publishing: false,
    }
  }

  public render() {
    const currentTabState = this.getCurrentTabState()

    return (
      <Dialog
        id="publish-repository"
        title={__DARWIN__ ? 'Publish Repository' : 'Publish repository'}
        onDismissed={this.props.onDismissed}
        onSubmit={this.publishRepository}
        disabled={this.state.publishing}
        loading={this.state.publishing}
      >
        <TabBar
          onTabClicked={this.onTabClicked}
          selectedIndex={this.state.currentTab}
        >
          <span id="dotcom-tab">GitHub.com</span>
          <span id="enterprise-tab">GitHub Enterprise</span>
        </TabBar>

        {currentTabState.error ? (
          <DialogError>{currentTabState.error.message}</DialogError>
        ) : null}

        <div
          role="tabpanel"
          aria-labelledby={
            currentTabState.kind === 'dotcom' ? 'dotcom-tab' : 'enterprise-tab'
          }
        >
          {this.renderContent()}
          {this.renderFooter()}
        </div>
      </Dialog>
    )
  }

  public async componentDidMount() {
    const currentTabState = this.getCurrentTabState()

    try {
      const description = await getGitDescription(this.props.repository.path)
      const settings = {
        ...currentTabState.settings,
        description,
      }

      this.setCurrentTabSettings(settings)
    } catch (error) {
      log.warn(`Couldn't get the repository's description`, error)
    }
  }

  private renderContent() {
    const tab = this.state.currentTab
    const currentTabState = this.getCurrentTabState()
    const accounts = this.getAccountsForTab(tab, this.props.accounts)
    const account =
      (currentTabState.kind === 'enterprise'
        ? currentTabState.selectedAccount
        : undefined) ?? accounts.at(0)

    if (account) {
      return (
        <PublishRepository
          account={account}
          accounts={accounts}
          settings={currentTabState.settings}
          onSettingsChanged={this.onSettingsChanged}
          onSelectedAccountChanged={this.onSelectedAccountChanged}
        />
      )
    } else {
      return <DialogContent>{this.renderSignInTab(tab)}</DialogContent>
    }
  }

  private onSelectedAccountChanged = (account: Account | null) => {
    const tabState = this.getCurrentTabState()
    if (tabState.kind === 'enterprise') {
      const enterpriseTabState = {
        ...this.state.enterpriseTabState,
        selectedAccount: account,
      }
      this.setTabState(enterpriseTabState)
    }
  }

  private onSettingsChanged = (settings: RepositoryPublicationSettings) => {
    const current = this.getCurrentTabState()
    let tabState: TabState
    if (settings.kind === PublishSettingsType.enterprise) {
      tabState = {
        kind: 'enterprise',
        settings: settings,
        error: this.state.enterpriseTabState.error,
        selectedAccount:
          current.kind === 'enterprise' ? current.selectedAccount : null,
      }
    } else {
      tabState = {
        kind: 'dotcom',
        settings: settings,
        error: this.state.dotcomTabState.error,
      }
    }

    this.setTabState(tabState)
  }

  private getTabState(tab: PublishTab) {
    if (tab === PublishTab.DotCom) {
      return this.state.dotcomTabState
    } else if (tab === PublishTab.Enterprise) {
      return this.state.enterpriseTabState
    } else {
      assertNever(tab, `Unknown tab: ${tab}`)
    }
  }

  private getAccountForTab(tab: PublishTab): Account | null {
    const tabState = this.getTabState(tab)
    const tabAccounts = this.getAccountsForTab(tab, this.props.accounts)
    const selectedAccount =
      (tabState.kind === 'enterprise'
        ? tabAccounts.find(
            a => a.endpoint === tabState.selectedAccount?.endpoint
          )
        : undefined) ?? tabAccounts.at(0)

    return selectedAccount ?? null
  }

  private renderSignInTab(tab: PublishTab) {
    const signInTitle = __DARWIN__ ? 'Sign In' : 'Sign in'
    switch (tab) {
      case PublishTab.DotCom:
        return (
          <CallToAction actionTitle={signInTitle} onAction={this.signInDotCom}>
            <div>
              Sign in to your GitHub.com account to access your repositories.
            </div>
          </CallToAction>
        )
      case PublishTab.Enterprise:
        return (
          <CallToAction
            actionTitle={signInTitle}
            onAction={this.signInEnterprise}
          >
            <div>
              If you are using GitHub Enterprise at work, sign in to it to get
              access to your repositories.
            </div>
          </CallToAction>
        )
      default:
        return assertNever(tab, `Unknown tab: ${tab}`)
    }
  }

  private renderFooter() {
    const currentTabState = this.getCurrentTabState()
    const disabled = !currentTabState.settings.name.length
    const tab = this.state.currentTab
    const user = this.getAccountForTab(tab)
    if (user) {
      return (
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={
              __DARWIN__ ? 'Publish Repository' : 'Publish repository'
            }
            okButtonDisabled={disabled}
          />
        </DialogFooter>
      )
    } else {
      return null
    }
  }

  private signInDotCom = () => {
    this.props.dispatcher.showDotComSignInDialog()
  }

  private signInEnterprise = () => {
    this.props.dispatcher.showEnterpriseSignInDialog()
  }

  private publishRepository = async () => {
    const currentTabState = this.getCurrentTabState()

    this.setCurrentTabError(null)
    this.setState({ publishing: true })

    const tab = this.state.currentTab
    const account = this.getAccountForTab(tab)
    if (!account) {
      fatalError(`Tried to publish with no user. That seems impossible!`)
    }

    const settings = currentTabState.settings
    const { org } = currentTabState.settings

    try {
      await this.props.dispatcher.publishRepository(
        this.props.repository,
        settings.name,
        settings.description,
        settings.private,
        account,
        org
      )

      this.props.onDismissed()
    } catch (e) {
      this.setCurrentTabError(e)
      this.setState({ publishing: false })
    }
  }

  private onTabClicked = (index: PublishTab) => {
    const isTabChanging = index !== this.state.currentTab
    if (isTabChanging) {
      this.setState({ currentTab: index })
    }
  }

  private getCurrentTabState = () =>
    this.state.currentTab === PublishTab.DotCom
      ? this.state.dotcomTabState
      : this.state.enterpriseTabState

  private setTabState = (state: TabState) => {
    if (state.kind === 'enterprise') {
      this.setState({ enterpriseTabState: state })
    } else {
      this.setState({ dotcomTabState: state })
    }
  }

  private setCurrentTabSettings = (settings: RepositoryPublicationSettings) => {
    if (settings.kind === PublishSettingsType.enterprise) {
      const enterpriseTabState = {
        ...this.state.enterpriseTabState,
        settings: settings,
      }
      this.setTabState(enterpriseTabState)
    } else {
      const dotcomTabState = {
        ...this.state.dotcomTabState,
        settings: settings,
      }
      this.setTabState(dotcomTabState)
    }
  }

  private setCurrentTabError = (error: Error | null) => {
    this.setTabState({
      ...this.getCurrentTabState(),
      error: error,
    })
  }
}
