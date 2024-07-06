import * as React from 'react'
import { PublishRepository } from './publish-repository'
import { Dispatcher } from '../dispatcher'
import { Account } from '../../models/account'
import { Repository } from '../../models/repository'
import { Dialog, DialogFooter, DialogContent, DialogError } from '../dialog'
import { TabBar } from '../tab-bar'
import { getDotComAPIEndpoint } from '../../lib/api'
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
  public constructor(props: IPublishProps) {
    super(props)

    const dotComAccount = this.getAccountForTab(PublishTab.DotCom)
    const enterpriseAccount = this.getAccountForTab(PublishTab.Enterprise)
    let startingTab = PublishTab.DotCom
    if (!dotComAccount && enterpriseAccount) {
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
    const account = this.getAccountForTab(tab)
    if (account) {
      return (
        <PublishRepository
          account={account}
          settings={currentTabState.settings}
          onSettingsChanged={this.onSettingsChanged}
        />
      )
    } else {
      return <DialogContent>{this.renderSignInTab(tab)}</DialogContent>
    }
  }

  private onSettingsChanged = (settings: RepositoryPublicationSettings) => {
    let tabState: TabState
    if (settings.kind === PublishSettingsType.enterprise) {
      tabState = {
        kind: 'enterprise',
        settings: settings,
        error: this.state.enterpriseTabState.error,
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

  private getAccountForTab(tab: PublishTab): Account | null {
    const accounts = this.props.accounts
    switch (tab) {
      case PublishTab.DotCom:
        return accounts.find(a => a.endpoint === getDotComAPIEndpoint()) || null
      case PublishTab.Enterprise:
        return accounts.find(a => a.endpoint !== getDotComAPIEndpoint()) || null
      default:
        return assertNever(tab, `Unknown tab: ${tab}`)
    }
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
              If you have a GitHub Enterprise or AE account at work, sign in to
              it to get access to your repositories.
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
