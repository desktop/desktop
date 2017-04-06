import * as React from 'react'
import { PublishRepository, IPublishRepositorySettings } from './publish-repository'
import { Dispatcher } from '../../lib/dispatcher'
import { User } from '../../models/user'
import { Repository } from '../../models/repository'
import { ButtonGroup } from '../lib/button-group'
import { Button } from '../lib/button'
import { Dialog, DialogFooter, DialogContent } from '../dialog'
import { TabBar } from '../tab-bar'
import { Row } from '../lib/row'
import { getDotComAPIEndpoint } from '../../lib/api'
import { assertNever, fatalError } from '../../lib/fatal-error'

enum PublishTab {
  DotCom = 0,
  Enterprise,
}

interface IPublishProps {
  readonly dispatcher: Dispatcher

  /** The repository being published. */
  readonly repository: Repository

  /** The signed in users. */
  readonly users: ReadonlyArray<User>

  /** The function to call when the dialog should be dismissed. */
  readonly onDismissed: () => void
}

interface IPublishState {
  /** The currently selected tab. */
  readonly currentTab: PublishTab

  /** The settings for publishing the repository. */
  readonly publishSettings: IPublishRepositorySettings
}

/**
 * The Publish component.
 */
export class Publish extends React.Component<IPublishProps, IPublishState> {
  public constructor(props: IPublishProps) {
    super(props)

    const dotComUser = this.getUserForTab(PublishTab.DotCom)
    const enterpriseUser = this.getUserForTab(PublishTab.Enterprise)
    let startingTab = PublishTab.DotCom
    if (!dotComUser && enterpriseUser) {
      startingTab = PublishTab.Enterprise
    }

    const publishSettings = {
      name: props.repository.name,
      description: '',
      private: true,
      org: null,
    }

    this.state = {
      currentTab: startingTab,
      publishSettings,
    }
  }

  public render() {
    return (
      <Dialog
        id='publish-repository'
        title={ __DARWIN__ ? 'Publish Repository' : 'Publish repository'}
        onDismissed={this.props.onDismissed}
        onSubmit={this.publishRepository}
      >
        <TabBar onTabClicked={this.onTabClicked} selectedIndex={this.state.currentTab}>
          <span>GitHub.com</span>
          <span>Enterprise</span>
        </TabBar>

        {this.renderContent()}
        {this.renderFooter()}
      </Dialog>
    )
  }

  private renderContent() {
    const tab = this.state.currentTab
    const user = this.getUserForTab(tab)
    if (user) {
      return <PublishRepository
        user={user}
        settings={this.state.publishSettings}
        onSettingsChanged={this.onSettingsChanged}/>
    } else {
      return (
        <DialogContent className='account-sign-in'>
          {this.renderSignInTab(tab)}
        </DialogContent>
      )
    }
  }

  private onSettingsChanged = (settings: IPublishRepositorySettings) => {
    this.setState({ publishSettings: settings })
  }

  private getUserForTab(tab: PublishTab): User | null {
    const users = this.props.users
    switch (tab) {
      case PublishTab.DotCom:
        return users.find(u => u.endpoint === getDotComAPIEndpoint()) || null
      case PublishTab.Enterprise:
        return users.find(u => u.endpoint !== getDotComAPIEndpoint()) || null
      default:
        return assertNever(tab, `Unknown tab: ${tab}`)
    }
  }

  private renderSignInTab(tab: PublishTab) {
    switch (tab) {
      case PublishTab.DotCom:
        return (
          <Row>
            <div>If you have a GitHub Enterprise account at work, sign in to it to get access to your repositories.</div>
            <Button type='submit' onClick={this.signInDotCom}>Sign In</Button>
          </Row>
        )
      case PublishTab.Enterprise:
        return (
          <Row>
            <div>Sign in to your GitHub.com account to access your repositories.</div>
            <Button type='submit' onClick={this.signInEnterprise}>Sign In</Button>
          </Row>
        )
      default:
        return assertNever(tab, `Unknown tab: ${tab}`)
    }
  }

  private renderFooter() {
    const disabled = !this.state.publishSettings.name.length
    const tab = this.state.currentTab
    const user = this.getUserForTab(tab)
    if (user) {
      return (
        <DialogFooter>
          <ButtonGroup>
            <Button type='submit' disabled={disabled}>{__DARWIN__ ? 'Publish Repository' : 'Publish repository'}</Button>
            <Button onClick={this.props.onDismissed}>Cancel</Button>
          </ButtonGroup>
        </DialogFooter>
      )
    } else {
      return null
    }
  }

  private signInDotCom = (event: React.FormEvent<HTMLButtonElement>) => {
    event.preventDefault()

    this.props.dispatcher.showDotComSignInDialog()
  }

  private signInEnterprise = (event: React.FormEvent<HTMLButtonElement>) => {
    event.preventDefault()

    this.props.dispatcher.showEnterpriseSignInDialog()
  }

  private publishRepository = () => {
    const tab = this.state.currentTab
    const user = this.getUserForTab(tab)
    if (!user) {
      fatalError(`Tried to publish with no user. That seems impossible!`)
      return
    }

    const settings = this.state.publishSettings
    this.props.dispatcher.publishRepository(this.props.repository, settings.name, settings.description, settings.private, user, settings.org)
    this.props.onDismissed()
  }

  private onTabClicked = (index: PublishTab) => {
    this.setState({ currentTab: index })
  }
}
