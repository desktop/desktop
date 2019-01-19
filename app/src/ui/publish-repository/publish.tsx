import * as React from 'react'
import {
  PublishRepository,
  IPublishRepositorySettings,
} from './publish-repository'
import { Dispatcher } from '../../lib/dispatcher'
import { Account } from '../../models/account'
import { Repository } from '../../models/repository'
import { ButtonGroup } from '../lib/button-group'
import { Button } from '../lib/button'
import { Dialog, DialogFooter, DialogContent, DialogError } from '../dialog'
import { TabBar } from '../tab-bar'
import { getDotComAPIEndpoint } from '../../lib/api'
import { assertNever, fatalError } from '../../lib/fatal-error'
import { CallToAction } from '../lib/call-to-action'
import { getGitDescription } from '../../lib/git'

enum PublishTab {
  DotCom = 0,
  Enterprise,
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

interface IPublishTabState {
  /** The settings for publishing the repository. */
  readonly publishSettings: IPublishRepositorySettings

  /**
   * An error which, if present, is presented to the
   * user in close proximity to the actions or input fields
   * related to the current step.
   */
  readonly error: Error | null
}

interface IPublishState {
  /** The currently selected tab. */
  readonly currentTab: PublishTab

  /** The state of dotCom tab. */
  readonly dotComTabState: IPublishTabState

  /** The state of enterprise tab. */
  readonly enterpriseTabState: IPublishTabState

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

    const publishSettings = {
      name: props.repository.name,
      description: '',
      private: true,
      org: null,
    }

    const startingTabState = {
      publishSettings: { ...publishSettings },
      error: null,
    }

    this.state = {
      currentTab: startingTab,
      dotComTabState: { ...startingTabState },
      enterpriseTabState: { ...startingTabState },
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
          <span>GitHub.com</span>
          <span>Enterprise</span>
        </TabBar>

        {currentTabState.error ? (
          <DialogError>{currentTabState.error.message}</DialogError>
        ) : null}

        {this.renderContent()}
        {this.renderFooter()}
      </Dialog>
    )
  }

  public async componentDidMount() {
    const currentTabState = this.getCurrentTabState()

    try {
      const description = await getGitDescription(this.props.repository.path)
      const settings = {
        ...currentTabState.publishSettings,
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
          settings={currentTabState.publishSettings}
          onSettingsChanged={this.onSettingsChanged}
        />
      )
    } else {
      return <DialogContent>{this.renderSignInTab(tab)}</DialogContent>
    }
  }

  private onSettingsChanged = (settings: IPublishRepositorySettings) => {
    this.setCurrentTabSettings(settings)
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
              If you have a GitHub Enterprise account at work, sign in to it to
              get access to your repositories.
            </div>
          </CallToAction>
        )
      default:
        return assertNever(tab, `Unknown tab: ${tab}`)
    }
  }

  private renderFooter() {
    const currentTabState = this.getCurrentTabState()
    const disabled = !currentTabState.publishSettings.name.length
    const tab = this.state.currentTab
    const user = this.getAccountForTab(tab)
    if (user) {
      return (
        <DialogFooter>
          <ButtonGroup>
            <Button type="submit" disabled={disabled}>
              {__DARWIN__ ? 'Publish Repository' : 'Publish repository'}
            </Button>
            <Button onClick={this.props.onDismissed}>Cancel</Button>
          </ButtonGroup>
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
      return
    }

    const settings = currentTabState.publishSettings

    try {
      await this.props.dispatcher.publishRepository(
        this.props.repository,
        settings.name,
        settings.description,
        settings.private,
        account,
        settings.org
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
      ? this.state.dotComTabState
      : this.state.enterpriseTabState

  private setTabState = (tabState: IPublishTabState) => {
    if (this.state.currentTab === PublishTab.DotCom) {
      this.setState({
        dotComTabState: { ...tabState },
      })
    } else {
      this.setState({
        enterpriseTabState: { ...tabState },
      })
    }
  }

  private setCurrentTabSettings = (settings: IPublishRepositorySettings) => {
    this.setTabState({
      ...this.getCurrentTabState(),
      publishSettings: { ...settings },
    })
  }

  private setCurrentTabError = (error: Error | null) => {
    this.setTabState({
      ...this.getCurrentTabState(),
      error: error,
    })
  }
}
