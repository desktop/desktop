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
  parseRemote,
} from '../../lib/remote-parsing'
import { findAccountForRemoteURL } from '../../lib/find-account'
import { API, IAPIRepository } from '../../lib/api'
import { Dialog, DialogError, DialogFooter, DialogContent } from '../dialog'
import { TabBar } from '../tab-bar'
import { CloneRepositoryTab } from '../../models/clone-repository-tab'
import { CloneGenericRepository } from './clone-generic-repository'
import { CloneGithubRepository } from './clone-github-repository'

import { assertNever } from '../../lib/fatal-error'
import { CallToAction } from '../lib/call-to-action'
import { IAccountRepositories } from '../../lib/stores/apiRepositoriesStore'
import { merge } from '../../lib/merge'

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

  readonly apiRepositories: ReadonlyMap<Account, IAccountRepositories>
  readonly onRefreshRepositories: (account: Account) => void
}

interface ICloneRepositoryState {
  /** A copy of the path state field which is set when the component initializes.
   *
   *  This value, as opposed to the path state variable, doesn't change for the
   *  lifetime of the component. Used to keep track of whether the user has
   *  modified the path state field which influences whether we show a
   *  warning about the directory already existing or not.
   *
   *  See the onWindowFocus method for more information.
   */
  readonly initialPath: string

  /** Are we currently trying to load the entered repository? */
  readonly loading: boolean

  readonly dotComTabState: IGitHubTabState
  readonly enterpriseTabState: IGitHubTabState
  readonly urlTabState: IUrlTabState
}

interface IBaseTabState {
  /** The current error if one occurred. */
  readonly error: Error | null

  /**
   * The repository identifier that was last parsed from the user-entered URL.
   */
  readonly lastParsedIdentifier: IRepositoryIdentifier | null
  /** The local path to clone to. */
  readonly path: string

  /** The user-entered URL or `owner/name` shortcut. */
  readonly url: string
}

interface IUrlTabState extends IBaseTabState {
  readonly kind: 'urlTabState'
}

interface IGitHubTabState extends IBaseTabState {
  readonly kind: 'dotComTabState' | 'enterpriseTabState'
  readonly filterText: string
  readonly selectedItem: IAPIRepository | null
}

/** The component for cloning a repository. */
export class CloneRepository extends React.Component<
  ICloneRepositoryProps,
  ICloneRepositoryState
> {
  public constructor(props: ICloneRepositoryProps) {
    super(props)

    const defaultDirectory = getDefaultDir()
    this.state = {
      initialPath: defaultDirectory,
      loading: false,
      dotComTabState: {
        kind: 'dotComTabState',
        error: null,
        lastParsedIdentifier: null,
        filterText: '',
        path: defaultDirectory,
        selectedItem: null,
        url: this.props.initialURL || '',
      },
      enterpriseTabState: {
        kind: 'enterpriseTabState',
        error: null,
        lastParsedIdentifier: null,
        filterText: '',
        path: defaultDirectory,
        selectedItem: null,
        url: this.props.initialURL || '',
      },
      urlTabState: {
        kind: 'urlTabState',
        error: null,
        lastParsedIdentifier: null,
        path: defaultDirectory,
        url: this.props.initialURL || '',
      },
    }
  }

  public componentDidUpdate(prevProps: ICloneRepositoryProps) {
    if (prevProps.selectedTab !== this.props.selectedTab) {
      this.refreshPath()
    }
  }

  public componentDidMount() {
    const initialURL = this.props.initialURL
    if (initialURL) {
      this.updateUrl(initialURL)
    }

    window.addEventListener('focus', this.onWindowFocus)
  }

  public componentWillUnmount() {
    window.removeEventListener('focus', this.onWindowFocus)
  }

  public render() {
    const { error } = this.getSelectedTabState()
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

    const tabState = this.getSelectedTabState()

    const error = tabState.error
    const disabled =
      tabState.url.length === 0 ||
      tabState.path.length === 0 ||
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
        const tabState = this.state.urlTabState
        return (
          <CloneGenericRepository
            path={tabState.path}
            url={tabState.url}
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
          const accountState = this.props.apiRepositories.get(account)
          const repositories =
            accountState === undefined ? null : accountState.repositories
          const loading =
            accountState === undefined ? false : accountState.loading
          const tabState = this.getGitHubTabState(tab)

          return (
            <CloneGithubRepository
              path={tabState.path}
              account={account}
              onPathChanged={this.updateAndValidatePath}
              selectedItem={tabState.selectedItem}
              onSelectionChanged={this.onSelectionChanged}
              onChooseDirectory={this.onChooseDirectory}
              repositories={repositories}
              loading={loading}
              onRefreshRepositories={this.props.onRefreshRepositories}
              filterText={tabState.filterText}
              onFilterTextChanged={this.onFilterTextChanged}
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

  private getGitHubTabState(
    tab: CloneRepositoryTab.DotCom | CloneRepositoryTab.Enterprise
  ): IGitHubTabState {
    if (tab === CloneRepositoryTab.DotCom) {
      return this.state.dotComTabState
    } else if (tab === CloneRepositoryTab.Enterprise) {
      return this.state.enterpriseTabState
    } else {
      return assertNever(tab, `Unknown tab: ${tab}`)
    }
  }

  private getTabState(tab: CloneRepositoryTab): IBaseTabState {
    if (tab === CloneRepositoryTab.DotCom) {
      return this.state.dotComTabState
    } else if (tab === CloneRepositoryTab.Enterprise) {
      return this.state.enterpriseTabState
    } else if (tab === CloneRepositoryTab.Generic) {
      return this.state.urlTabState
    } else {
      return assertNever(tab, `Unknown tab: ${tab}`)
    }
  }

  private getSelectedTabState(): IBaseTabState {
    return this.getTabState(this.props.selectedTab)
  }

  private setSelectedTabState<K extends keyof IBaseTabState>(
    state: Pick<IBaseTabState, K>
  ) {
    this.setTabState(state, this.props.selectedTab)
  }

  private setTabState<K extends keyof IBaseTabState>(
    state: Pick<IBaseTabState, K>,
    tab: CloneRepositoryTab
  ): void {
    if (tab === CloneRepositoryTab.DotCom) {
      this.setState(prevState => ({
        dotComTabState: merge<IGitHubTabState, keyof IBaseTabState>(
          prevState.dotComTabState,
          state
        ),
      }))
    } else if (tab === CloneRepositoryTab.Enterprise) {
      this.setState(prevState => ({
        enterpriseTabState: merge<IGitHubTabState, keyof IBaseTabState>(
          prevState.dotComTabState,
          state
        ),
      }))
    } else if (tab === CloneRepositoryTab.Generic) {
      this.setState(prevState => ({
        urlTabState: merge<IUrlTabState, keyof IBaseTabState>(
          prevState.urlTabState,
          state
        ),
      }))
    } else {
      return assertNever(tab, `Unknown tab: ${tab}`)
    }
  }

  private setGitHubTabState<K extends keyof IGitHubTabState>(
    tabState: Pick<IGitHubTabState, K>,
    tab: CloneRepositoryTab.DotCom | CloneRepositoryTab.Enterprise
  ): void {
    if (tab === CloneRepositoryTab.DotCom) {
      this.setState(prevState => ({
        dotComTabState: merge(prevState.dotComTabState, tabState),
      }))
    } else if (tab === CloneRepositoryTab.Enterprise) {
      this.setState(prevState => ({
        enterpriseTabState: merge(prevState.enterpriseTabState, tabState),
      }))
    } else {
      return assertNever(tab, `Unknown tab: ${tab}`)
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
    const tab = this.props.selectedTab
    this.setTabState({ path }, tab)

    const doesDirectoryExist = await pathExists(path)
    const tabState = this.getTabState(tab)

    // If the path changed while we were checking, we don't care anymore.
    if (tabState.path !== path) {
      return
    }

    if (doesDirectoryExist) {
      const error: Error = new Error('The destination already exists.')
      error.name = DestinationExistsErrorName

      this.setTabState({ error }, tab)
    } else {
      this.setTabState({ error: null }, tab)
    }
  }

  private onFilterTextChanged = (filterText: string) => {
    if (this.props.selectedTab !== CloneRepositoryTab.Generic) {
      this.setGitHubTabState({ filterText }, this.props.selectedTab)
    }
  }

  private onSelectionChanged = (selectedItem: IAPIRepository | null) => {
    if (this.props.selectedTab !== CloneRepositoryTab.Generic) {
      this.setGitHubTabState({ selectedItem }, this.props.selectedTab)
      this.updateUrl(selectedItem === null ? '' : selectedItem.clone_url)
    }
  }

  private onChooseDirectory = async () => {
    const directories = remote.dialog.showOpenDialog({
      properties: ['createDirectory', 'openDirectory'],
    })

    if (!directories) {
      return
    }

    const tabState = this.getSelectedTabState()
    const lastParsedIdentifier = tabState.lastParsedIdentifier
    const directory = lastParsedIdentifier
      ? Path.join(directories[0], lastParsedIdentifier.name)
      : directories[0]

    this.updateAndValidatePath(directory)

    return directory
  }

  private updateUrl = async (url: string) => {
    const parsed = parseRepositoryIdentifier(url)
    const tabState = this.getSelectedTabState()
    const lastParsedIdentifier = tabState.lastParsedIdentifier

    let newPath: string

    if (lastParsedIdentifier) {
      if (parsed) {
        newPath = Path.join(Path.dirname(tabState.path), parsed.name)
      } else {
        newPath = Path.dirname(tabState.path)
      }
    } else if (parsed) {
      newPath = Path.join(tabState.path, parsed.name)
    } else {
      newPath = tabState.path
    }

    this.setSelectedTabState({
      url,
      lastParsedIdentifier: parsed,
    })

    this.updateAndValidatePath(newPath)
  }

  /**
   * Lookup the account associated with the clone (if applicable) and resolve
   * the repository alias to the clone URL.
   */
  private async resolveCloneURL(): Promise<string | null> {
    const tabState = this.getSelectedTabState()
    const identifier = tabState.lastParsedIdentifier
    let url = tabState.url
    const accounts: Array<Account> = []
    if (this.props.dotComAccount) {
      accounts.push(this.props.dotComAccount)
    }

    if (this.props.enterpriseAccount) {
      accounts.push(this.props.enterpriseAccount)
    }

    const account = await findAccountForRemoteURL(url, accounts)
    if (identifier && account) {
      const api = API.fromAccount(account)
      const repo = await api.fetchRepository(identifier.owner, identifier.name)
      if (repo) {
        // respect the user's preference if they pasted an SSH URL into the
        // Clone Generic Repository tab
        const parsedUrl = parseRemote(url)
        if (parsedUrl && parsedUrl.protocol === 'ssh') {
          url = repo.ssh_url
        } else {
          url = repo.clone_url
        }
      }
    }

    return url
  }

  private clone = async () => {
    this.setState({ loading: true })

    const url = await this.resolveCloneURL()
    const { path } = this.getSelectedTabState()

    if (!url) {
      const error = new Error(
        `We couldn't find that repository. Check that you are logged in, the network is accessible, and the URL or repository alias are spelled correctly.`
      )
      this.setState({ loading: false })
      this.setSelectedTabState({ error })
      return
    }

    try {
      this.cloneImpl(url.trim(), path)
    } catch (e) {
      log.error(`CloneRepostiory: clone failed to complete to ${path}`, e)
      this.setState({ loading: false })
      this.setSelectedTabState({ error: e })
    }
  }

  private cloneImpl(url: string, path: string) {
    this.props.dispatcher.clone(url, path)
    this.props.onDismissed()

    setDefaultDir(Path.resolve(path, '..'))
  }

  private refreshPath() {
    const tabState = this.getSelectedTabState()
    const isDefaultPath = this.state.initialPath === tabState.path
    const isURLNotEntered = tabState.url === ''

    if (isDefaultPath && isURLNotEntered) {
      if (
        tabState.error !== null &&
        tabState.error.name === DestinationExistsErrorName
      ) {
        this.setSelectedTabState({ error: null })
      }
    } else {
      this.updateAndValidatePath(tabState.path)
    }
  }

  private onWindowFocus = () => {
    // Verify the path after focus has been regained in case changes have been made.
    this.refreshPath()
  }
}
