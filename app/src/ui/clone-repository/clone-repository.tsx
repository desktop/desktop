import * as Path from 'path'
import * as React from 'react'
import { Dispatcher } from '../dispatcher'
import { getDefaultDir, setDefaultDir } from '../lib/default-dir'
import { Account } from '../../models/account'
import { FoldoutType } from '../../lib/app-state'
import {
  IRepositoryIdentifier,
  parseRepositoryIdentifier,
  parseRemote,
} from '../../lib/remote-parsing'
import { findAccountForRemoteURL } from '../../lib/find-account'
import { API, IAPIRepository, IAPIRepositoryCloneInfo } from '../../lib/api'
import { Dialog, DialogError, DialogFooter, DialogContent } from '../dialog'
import { TabBar } from '../tab-bar'
import { CloneRepositoryTab } from '../../models/clone-repository-tab'
import { CloneGenericRepository } from './clone-generic-repository'
import { CloneGithubRepository } from './clone-github-repository'
import { assertNever } from '../../lib/fatal-error'
import { CallToAction } from '../lib/call-to-action'
import { IAccountRepositories } from '../../lib/stores/api-repositories-store'
import { merge } from '../../lib/merge'
import { ClickSource } from '../lib/list'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { showOpenDialog, showSaveDialog } from '../main-process-proxy'
import { readdir } from 'fs/promises'
import { isTopMostDialog } from '../dialog/is-top-most'

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

  /**
   * A map keyed on a user account (GitHub.com or GitHub Enterprise)
   * containing an object with repositories that the authenticated
   * user has explicit permission (:read, :write, or :admin) to access
   * as well as information about whether the list of repositories
   * is currently being loaded or not.
   *
   * If a currently signed in account is missing from the map that
   * means that the list of accessible repositories has not yet been
   * loaded. An entry for an account with an empty list of repositories
   * means that no accessible repositories was found for the account.
   *
   * See the ApiRepositoriesStore for more details on loading repositories
   */
  readonly apiRepositories: ReadonlyMap<Account, IAccountRepositories>

  /**
   * Called when the user requests a refresh of the repositories
   * available for cloning.
   */
  readonly onRefreshRepositories: (account: Account) => void

  /** Whether the dialog is the top most in the dialog stack */
  readonly isTopMost: boolean
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
  readonly initialPath: string | null

  /** Are we currently trying to load the entered repository? */
  readonly loading: boolean

  /**
   * The persisted state of the CloneGitHubRepository component for
   * the GitHub.com account.
   */
  readonly dotComTabState: IGitHubTabState

  /**
   * The persisted state of the CloneGitHubRepository component for
   * the GitHub Enterprise account.
   */
  readonly enterpriseTabState: IGitHubTabState

  /**
   * The persisted state of the CloneGenericRepository component.
   */
  readonly urlTabState: IUrlTabState
}

/**
 * Common persisted state for the CloneGitHubRepository and
 * CloneGenericRepository components.
 */
interface IBaseTabState {
  /** The current error if one occurred. */
  readonly error: Error | null

  /**
   * The repository identifier that was last parsed from the user-entered URL.
   */
  readonly lastParsedIdentifier: IRepositoryIdentifier | null

  /** The local path to clone to. */
  readonly path: string | null

  /** The user-entered URL or `owner/name` shortcut. */
  readonly url: string
}

interface IUrlTabState extends IBaseTabState {
  readonly kind: 'urlTabState'
}

/**
 * Persisted state for the CloneGitHubRepository component.
 */
interface IGitHubTabState extends IBaseTabState {
  readonly kind: 'dotComTabState' | 'enterpriseTabState'

  /**
   * The contents of the filter text box used to filter the list of
   * repositories.
   */
  readonly filterText: string

  /**
   * The currently selected repository, or null if no repository
   * is selected.
   */
  readonly selectedItem: IAPIRepository | null
}

/** The component for cloning a repository. */
export class CloneRepository extends React.Component<
  ICloneRepositoryProps,
  ICloneRepositoryState
> {
  private checkIsTopMostDialog = isTopMostDialog(
    () => {
      this.validatePath()
      window.addEventListener('focus', this.onWindowFocus)
    },
    () => {
      window.removeEventListener('focus', this.onWindowFocus)
    }
  )

  public constructor(props: ICloneRepositoryProps) {
    super(props)

    const defaultDirectory = null

    const initialBaseTabState: IBaseTabState = {
      error: null,
      lastParsedIdentifier: null,
      path: defaultDirectory,
      url: this.props.initialURL || '',
    }

    this.state = {
      initialPath: defaultDirectory,
      loading: false,
      dotComTabState: {
        kind: 'dotComTabState',
        filterText: '',
        selectedItem: null,
        ...initialBaseTabState,
      },
      enterpriseTabState: {
        kind: 'enterpriseTabState',
        filterText: '',
        selectedItem: null,
        ...initialBaseTabState,
      },
      urlTabState: {
        kind: 'urlTabState',
        ...initialBaseTabState,
      },
    }

    this.initializePath()
  }

  public componentDidUpdate(prevProps: ICloneRepositoryProps) {
    if (prevProps.selectedTab !== this.props.selectedTab) {
      this.validatePath()
    }

    if (prevProps.initialURL !== this.props.initialURL) {
      this.updateUrl(this.props.initialURL || '')
    }

    this.checkIsTopMostDialog(this.props.isTopMost)
  }

  public componentDidMount() {
    const initialURL = this.props.initialURL
    if (initialURL) {
      this.updateUrl(initialURL)
    }

    this.checkIsTopMostDialog(this.props.isTopMost)
  }

  public componentWillUnmount(): void {
    this.checkIsTopMostDialog(false)
  }

  private initializePath = async () => {
    const initialPath = await getDefaultDir()
    const dotComTabState = { ...this.state.dotComTabState, path: initialPath }
    const enterpriseTabState = {
      ...this.state.enterpriseTabState,
      path: initialPath,
    }
    const urlTabState = { ...this.state.urlTabState, path: initialPath }
    this.setState({
      initialPath,
      dotComTabState,
      enterpriseTabState,
      urlTabState,
    })

    // Update the local path based on the current url now that we have an
    // initial path
    const selectedTabState = this.getSelectedTabState()
    this.updateUrl(selectedTabState.url)
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
          <span id="dotcom-tab">GitHub.com</span>
          <span id="enterprise-tab">GitHub Enterprise</span>
          <span id="url-tab">URL</span>
        </TabBar>

        {error ? <DialogError>{error.message}</DialogError> : null}

        <div role="tabpanel" aria-labelledby={this.getSelectedTabId()}>
          {this.renderActiveTab()}
        </div>

        {this.renderFooter()}
      </Dialog>
    )
  }

  private getSelectedTabId = () => {
    return this.props.selectedTab === CloneRepositoryTab.DotCom
      ? 'dotcom-tab'
      : this.props.selectedTab === CloneRepositoryTab.Enterprise
      ? 'enterprise-tab'
      : 'url-tab'
  }

  private checkIfCloningDisabled = () => {
    const tabState = this.getSelectedTabState()
    const { error, url, path } = tabState
    const { loading } = this.state

    const disabled =
      url.length === 0 ||
      path == null ||
      path.length === 0 ||
      loading ||
      error !== null

    return disabled
  }

  private renderFooter() {
    const selectedTab = this.props.selectedTab
    if (
      selectedTab !== CloneRepositoryTab.Generic &&
      !this.getAccountForTab(selectedTab)
    ) {
      return null
    }

    const disabled = this.checkIfCloningDisabled()

    return (
      <DialogFooter>
        <OkCancelButtonGroup okButtonText="Clone" okButtonDisabled={disabled} />
      </DialogFooter>
    )
  }

  private onTabClicked = (tab: CloneRepositoryTab) => {
    this.props.onTabSelected(tab)
  }

  private onPathChanged = (path: string) => {
    this.setSelectedTabState({ path }, this.validatePath)
  }

  private renderActiveTab() {
    const tab = this.props.selectedTab

    switch (tab) {
      case CloneRepositoryTab.Generic:
        const tabState = this.state.urlTabState
        return (
          <CloneGenericRepository
            path={tabState.path ?? ''}
            url={tabState.url}
            onPathChanged={this.onPathChanged}
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
              path={tabState.path ?? ''}
              account={account}
              selectedItem={tabState.selectedItem}
              onSelectionChanged={this.onSelectionChanged}
              onPathChanged={this.onPathChanged}
              onChooseDirectory={this.onChooseDirectory}
              repositories={repositories}
              loading={loading}
              onRefreshRepositories={this.props.onRefreshRepositories}
              filterText={tabState.filterText}
              onFilterTextChanged={this.onFilterTextChanged}
              onItemClicked={this.onItemClicked}
            />
          )
        }
      }
      default:
        return assertNever(tab, `Unknown tab: ${tab}`)
    }
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

  /**
   * Update the state for the currently selected tab. Note that
   * since the selected tab can be using either IGitHubTabState
   * or IUrlTabState this method can only accept subset state
   * shared between the two types.
   */
  private setSelectedTabState<K extends keyof IBaseTabState>(
    state: Pick<IBaseTabState, K>,
    callback?: () => void
  ) {
    this.setTabState(state, this.props.selectedTab, callback)
  }

  /**
   * Merge the current state with the provided subset of state
   * for the provided tab.
   */
  private setTabState<K extends keyof IBaseTabState>(
    state: Pick<IBaseTabState, K>,
    tab: CloneRepositoryTab,
    callback?: () => void
  ): void {
    if (tab === CloneRepositoryTab.DotCom) {
      this.setState(
        prevState => ({
          dotComTabState: {
            ...prevState.dotComTabState,
            ...state,
          },
        }),
        callback
      )
    } else if (tab === CloneRepositoryTab.Enterprise) {
      this.setState(
        prevState => ({
          enterpriseTabState: {
            ...prevState.enterpriseTabState,
            ...state,
          },
        }),
        callback
      )
    } else if (tab === CloneRepositoryTab.Generic) {
      this.setState(
        prevState => ({
          urlTabState: { ...prevState.urlTabState, ...state },
        }),
        callback
      )
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
              If you have a GitHub Enterprise or AE account at work, sign in to
              it to get access to your repositories.
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

  private validatePath = async () => {
    const tabState = this.getSelectedTabState()
    const { path, url, error } = tabState
    const { initialPath } = this.state
    const isDefaultPath = initialPath === path
    const isURLNotEntered = url === ''

    if (isDefaultPath && isURLNotEntered) {
      if (error) {
        this.setSelectedTabState({ error: null })
      }
    } else {
      const pathValidation = await this.validateEmptyFolder(path)

      // We only care about the result if the path hasn't
      // changed since we went async
      const newTabState = this.getSelectedTabState()
      if (newTabState.path === path) {
        this.setSelectedTabState({ error: pathValidation, path })
      }
    }
  }

  private onChooseDirectory = async () => {
    // We received feedback (#12812) that using the save dialog is confusing on
    // windows due to appearing to require a file selection. This is not the case
    // on mac where it more clearly shows directory creation.
    if (__DARWIN__) {
      return this.onChooseWithSaveDialog()
    }

    return this.onChooseWithOpenDialog()
  }

  private onChooseWithOpenDialog = async (): Promise<string | undefined> => {
    const path = await showOpenDialog({
      properties: ['createDirectory', 'openDirectory'],
    })

    if (path === null) {
      return
    }

    const tabState = this.getSelectedTabState()
    const lastParsedIdentifier = tabState.lastParsedIdentifier
    const directory = lastParsedIdentifier
      ? Path.join(path, lastParsedIdentifier.name)
      : path

    this.setSelectedTabState(
      { path: directory, error: null },
      this.validatePath
    )

    return directory
  }

  private onChooseWithSaveDialog = async (): Promise<string | undefined> => {
    const tabState = this.getSelectedTabState()

    const path = await showSaveDialog({
      buttonLabel: 'Select',
      nameFieldLabel: 'Clone As:',
      showsTagField: false,
      defaultPath: tabState.path ?? '',
      properties: ['createDirectory'],
    })

    if (path == null) {
      return
    }

    this.setSelectedTabState({ path, error: null }, this.validatePath)

    return path
  }

  private updateUrl = async (url: string) => {
    const parsed = parseRepositoryIdentifier(url)
    const tabState = this.getSelectedTabState()
    const lastParsedIdentifier = tabState.lastParsedIdentifier

    // If there is no path yet, just update the url
    if (tabState.path === null) {
      this.setSelectedTabState({ url }, this.validatePath)
      return
    }

    let newPath: string

    const dirPath = tabState.path
    if (lastParsedIdentifier) {
      if (parsed) {
        newPath = Path.join(Path.dirname(dirPath), parsed.name)
      } else {
        newPath = Path.dirname(dirPath)
      }
    } else if (parsed) {
      newPath = Path.join(dirPath, parsed.name)
    } else {
      newPath = dirPath
    }

    this.setSelectedTabState(
      {
        url,
        lastParsedIdentifier: parsed,
        path: newPath,
      },
      this.validatePath
    )
  }

  private async validateEmptyFolder(
    path: string | null
  ): Promise<null | Error> {
    if (path === null) {
      return new Error(
        'Unable to read path on disk. Please check the path and try again.'
      )
    }

    try {
      const directoryFiles = await readdir(path)

      if (directoryFiles.length === 0) {
        return null
      } else {
        return new Error(
          'This folder contains files. Git can only clone to empty folders.'
        )
      }
    } catch (error) {
      if (error.code === 'ENOTDIR') {
        // path refers to a file or other file system entry
        return new Error(
          'There is already a file with this name. Git can only clone to a folder.'
        )
      }

      if (error.code === 'ENOENT') {
        // Folder does not exist
        return null
      }

      log.error(
        'CloneRepository: Path validation failed. Error: ' + error.message
      )
      return new Error(
        'Unable to read path on disk. Please check the path and try again.'
      )
    }
  }

  /**
   * Lookup the account associated with the clone (if applicable) and resolve
   * the repository alias to the clone URL and the repository default branch,
   * if possible.
   */
  private async resolveCloneInfo(): Promise<IAPIRepositoryCloneInfo | null> {
    const { url, lastParsedIdentifier } = this.getSelectedTabState()

    const accounts = new Array<Account>()
    if (this.props.dotComAccount) {
      accounts.push(this.props.dotComAccount)
    }

    if (this.props.enterpriseAccount) {
      accounts.push(this.props.enterpriseAccount)
    }

    const account = await findAccountForRemoteURL(url, accounts)
    if (lastParsedIdentifier !== null && account !== null) {
      const api = API.fromAccount(account)
      const { owner, name } = lastParsedIdentifier
      // Respect the user's preference if they provided an SSH URL
      const protocol = parseRemote(url)?.protocol

      return api.fetchRepositoryCloneInfo(owner, name, protocol).catch(err => {
        log.error(`Failed to look up repository clone info for '${url}'`, err)
        return { url }
      })
    }

    return { url }
  }

  private onItemClicked = (repository: IAPIRepository, source: ClickSource) => {
    if (source.kind === 'keyboard' && source.event.key === 'Enter') {
      if (this.checkIfCloningDisabled() === false) {
        this.clone()
      }
    }
  }

  private clone = async () => {
    this.setState({ loading: true })

    const cloneInfo = await this.resolveCloneInfo()
    const { path } = this.getSelectedTabState()

    if (path == null) {
      const error = new Error(`Directory could not be created at this path.`)
      this.setState({ loading: false })
      this.setSelectedTabState({ error })
      return
    }

    if (!cloneInfo) {
      const error = new Error(
        `We couldn't find that repository. Check that you are logged in, the network is accessible, and the URL or repository alias are spelled correctly.`
      )
      this.setState({ loading: false })
      this.setSelectedTabState({ error })
      return
    }

    const { url, defaultBranch } = cloneInfo

    this.props.dispatcher.closeFoldout(FoldoutType.Repository)
    try {
      this.cloneImpl(url.trim(), path, defaultBranch)
    } catch (e) {
      log.error(`CloneRepository: clone failed to complete to ${path}`, e)
      this.setState({ loading: false })
      this.setSelectedTabState({ error: e })
    }
  }

  private cloneImpl(url: string, path: string, defaultBranch?: string) {
    this.props.dispatcher.clone(url, path, { defaultBranch })
    this.props.onDismissed()

    setDefaultDir(Path.resolve(path, '..'))
  }

  private onWindowFocus = () => {
    // Verify the path after focus has been regained in
    // case the directory or directory contents has been
    // created/removed/altered while the user wasn't in-app.
    this.validatePath()
  }
}
