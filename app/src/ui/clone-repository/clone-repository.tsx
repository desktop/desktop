import * as Path from 'path'
import * as React from 'react'
import { remote } from 'electron'
import { pathExists } from 'fs-extra'

import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { Dispatcher } from '../../lib/dispatcher'
import { getDefaultDir, setDefaultDir } from '../lib/default-dir'
import { Account } from '../../models/account'
import {
  IRepositoryIdentifier,
  parseRepositoryIdentifier,
} from '../../lib/remote-parsing'
import { findAccountForRemoteURL } from '../../lib/find-account'
import { API } from '../../lib/api'
import { Dialog, DialogError, DialogFooter, DialogContent } from '../dialog'
import { TabBar } from '../tab-bar'
import { CloneRepositoryTab } from '../../models/clone-repository-tab'
import { CloneGenericRepository } from './clone-generic-repository'
import { CloneGithubRepository } from './clone-github-repository'

import { assertNever } from '../../lib/fatal-error'
import { CallToAction } from '../lib/call-to-action'

/** The name for the error when the destination already exists. */
const DestinationExistsErrorName = 'DestinationExistsError'

interface ICloneRepositoryProps {
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void

  /** The logged in accounts. */
  readonly dotComAccount: Account | null

  /** The logged in Enterprise account. */
  readonly enterpriseAccount: Account | null

  /** The initial URL or `owner/name` shortcut to use. */
  readonly initialURL: string | null

  /** The currently select tab. */
  readonly selectedTab: CloneRepositoryTab

  /** Called when the user selects a tab. */
  readonly onTabSelected: (tab: CloneRepositoryTab) => void
}

interface ICloneRepositoryState {
  /** The user-entered URL or `owner/name` shortcut. */
  readonly url: string

  /** The local path to clone to. */
  readonly path: string

  /** Are we currently trying to load the entered repository? */
  readonly loading: boolean

  /** The current error if one occurred. */
  readonly error: Error | null

  /**
   * The repository identifier that was last parsed from the user-entered URL.
   */
  readonly lastParsedIdentifier: IRepositoryIdentifier | null

  /** Should the component clear the filter text on render? */
  readonly shouldClearFilter: boolean
}

/** The component for cloning a repository. */
export class CloneRepository extends React.Component<
  ICloneRepositoryProps,
  ICloneRepositoryState
  > {
  public constructor(props: ICloneRepositoryProps) {
    super(props)

    this.state = {
      url: this.props.initialURL || '',
      path: getDefaultDir(),
      loading: false,
      error: null,
      lastParsedIdentifier: null,
      shouldClearFilter: false,
    }
  }

  public componentWillReceiveProps(nextProps: ICloneRepositoryProps) {
    this.setState({
      shouldClearFilter: this.props.selectedTab !== nextProps.selectedTab,
    })
  }

  public componentDidMount() {
    const initialURL = this.props.initialURL
    if (initialURL) {
      this.updateUrl(initialURL)
    }
  }

  public render() {
    const error = this.state.error
    return (
      <Dialog
        className="clone-repository"
        title={__DARWIN__ ? 'Clone a Repository' : 'Clone a repository'}
        onSubmit={this.clone}
        onDismissed={this.props.onDismissed}
        loading={this.state.loading}
      >
        <TabBar
          onTabClicked={this.onTabClicked}
          selectedIndex={this.props.selectedTab}
        >
          <span>GitHub.com</span>
          <span>Enterprise</span>
          <span>URL</span>
        </TabBar>

        {error ? <DialogError>{error.message}</DialogError> : null}

        {this.renderActiveTab()}

        {this.renderFooter()}
      </Dialog>
    )
  }

  private renderFooter() {
    const selectedTab = this.props.selectedTab
    if (
      selectedTab !== CloneRepositoryTab.Generic &&
      !this.getAccountForTab(selectedTab)
    ) {
      return null
    }

    const error = this.state.error
    const disabled =
      this.state.url.length === 0 ||
      this.state.path.length === 0 ||
      this.state.loading ||
      (!!error && error.name === DestinationExistsErrorName)

    return (
      <DialogFooter>
        <ButtonGroup>
          <Button disabled={disabled} type="submit">
            Clone
          </Button>
          <Button onClick={this.props.onDismissed}>Cancel</Button>
        </ButtonGroup>
      </DialogFooter>
    )
  }

  private onTabClicked = (tab: CloneRepositoryTab) => {
    this.props.onTabSelected(tab)
  }

  private renderActiveTab() {
    const tab = this.props.selectedTab

    switch (tab) {
      case CloneRepositoryTab.Generic:
        return (
          <CloneGenericRepository
            path={this.state.path}
            url={this.state.url}
            onPathChanged={this.updateAndValidatePath}
            onUrlChanged={this.updateUrl}
            onChooseDirectory={this.onChooseDirectory}
          />
        )

      case CloneRepositoryTab.DotCom:
      case CloneRepositoryTab.Enterprise: {
        const account = this.getAccountForTab(tab)
        if (!account) {
          return <DialogContent>{this.renderSignIn(tab)}</DialogContent>
        } else {
          return (
            <CloneGithubRepository
              path={this.state.path}
              account={account}
              onPathChanged={this.updateAndValidatePath}
              onGitHubRepositorySelected={this.updateUrl}
              onChooseDirectory={this.onChooseDirectory}
              shouldClearFilter={this.state.shouldClearFilter}
            />
          )
        }
      }
    }

    return assertNever(tab, `Unknown tab: ${tab}`)
  }

  private getAccountForTab(tab: CloneRepositoryTab): Account | null {
    switch (tab) {
      case CloneRepositoryTab.DotCom:
        return this.props.dotComAccount
      case CloneRepositoryTab.Enterprise:
        return this.props.enterpriseAccount
      default:
        return null
    }
  }

  private renderSignIn(tab: CloneRepositoryTab) {
    const signInTitle = __DARWIN__ ? 'Sign In' : 'Sign in'
    switch (tab) {
      case CloneRepositoryTab.DotCom:
        return (
          <CallToAction actionTitle={signInTitle} onAction={this.signInDotCom}>
            <div>
              Sign in to your GitHub.com account to access your repositories.
            </div>
          </CallToAction>
        )
      case CloneRepositoryTab.Enterprise:
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
      case CloneRepositoryTab.Generic:
        return null
      default:
        return assertNever(tab, `Unknown sign in tab: ${tab}`)
    }
  }

  private signInDotCom = () => {
    this.props.dispatcher.showDotComSignInDialog()
  }

  private signInEnterprise = () => {
    this.props.dispatcher.showEnterpriseSignInDialog()
  }

  private updateAndValidatePath = async (path: string) => {
    this.setState({ path })

    const doesDirectoryExist = await this.doesPathExist(path)

    if (doesDirectoryExist) {
      const error: Error = new Error('The destination already exists.')
      error.name = DestinationExistsErrorName

      this.setState({ error })
    } else {
      this.setState({ error: null })
    }
  }

  private onChooseDirectory = async () => {
    const directories = remote.dialog.showOpenDialog({
      properties: ['createDirectory', 'openDirectory'],
    })

    if (!directories) {
      return
    }

    const lastParsedIdentifier = this.state.lastParsedIdentifier
    const directory = lastParsedIdentifier
      ? Path.join(directories[0], lastParsedIdentifier.name)
      : directories[0]

    this.updateAndValidatePath(directory)

    return directory
  }

  private updateUrl = async (url: string) => {
    const parsed = parseRepositoryIdentifier(url)
    const lastParsedIdentifier = this.state.lastParsedIdentifier

    let newPath: string

    if (lastParsedIdentifier) {
      if (parsed) {
        newPath = Path.join(Path.dirname(this.state.path), parsed.name)
      } else {
        newPath = Path.dirname(this.state.path)
      }
    } else if (parsed) {
      newPath = Path.join(this.state.path, parsed.name)
    } else {
      newPath = this.state.path
    }

    this.setState({
      url,
      lastParsedIdentifier: parsed,
    })

    this.updateAndValidatePath(newPath)
  }

  private async doesPathExist(path: string) {
    const exists = await pathExists(path)
    // If the path changed while we were checking, we don't care anymore.
    if (this.state.path !== path) {
      return
    }

    return exists
  }

  /**
   * Lookup the account associated with the clone (if applicable) and resolve
   * the repository alias to the clone URL.
   */
  private async resolveCloneURL(): Promise<string | null> {
    const identifier = this.state.lastParsedIdentifier
    let url = this.state.url
    const accounts: Array<Account> = []
    if (this.props.dotComAccount) {
      accounts.push(this.props.dotComAccount)
    }

    if (this.props.enterpriseAccount) {
      accounts.push(this.props.enterpriseAccount)
    }

    const account = await findAccountForRemoteURL(url, accounts)
    if (identifier && account) {
      const repoExists = await fetch(url)
      if (repoExists.status == 404) {
        return null
      }
      const api = API.fromAccount(account)
      const repo = await api.fetchRepository(identifier.owner, identifier.name)
      if (repo) {
        url = repo.clone_url
      }
    }

    return url
  }

  private clone = async () => {
    this.setState({ loading: true })

    const url = await this.resolveCloneURL()
    const path = this.state.path

    console.log(url);

    if (!url) {
      const error = new Error(
        `We couldn't find that repository. Check that you are logged in, the network is accessible, and the URL or repository alias are spelled correctly.`
      )
      this.setState({ loading: false, error })
      return
    }

    try {
      this.cloneImpl(url.trim(), path)
    } catch (e) {
      log.error(`CloneRepostiory: clone failed to complete to ${path}`, e)
      this.setState({ loading: false, error: e })
    }
  }

  private async cloneImpl(url: string, path: string) {
    this.props.dispatcher.clone(url, path)
    this.props.onDismissed()

    setDefaultDir(Path.resolve(path, '..'))
  }
}
