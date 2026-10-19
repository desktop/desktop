import * as Path from 'path'
import * as React from 'react'
import { Dispatcher } from '../dispatcher'
import { getDefaultDir, setDefaultDir } from '../lib/default-dir'
import { Account, IAccountIdentity, isSameAccount } from '../../models/account'
import { FoldoutType } from '../../lib/app-state'
import {
  IRepositoryIdentifier,
  parseRepositoryIdentifier,
  parseRemote,
  sanitizeCloneName,
} from '../../lib/remote-parsing'
import { resolveURLCloneInfo } from '../../lib/clone-info'
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
import memoizeOne from 'memoize-one'
import { groupAccountsByHost } from '../account-picker'
import { SignInResult } from '../../lib/stores/sign-in-store'
import { LinkButton } from '../lib/link-button'
import { Row } from '../lib/row'

interface ICloneRepositoryProps {
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void

  readonly accounts: ReadonlyArray<Account>

  /** The initial URL or `owner/name` shortcut to use. */
  readonly initialURL: string | null

  /** The currently select tab. */
  readonly selectedTab: CloneRepositoryTab

  /** Called when the user selects a tab. */
  readonly onTabSelected: (tab: CloneRepositoryTab) => void

  /**
   * The account last picked in the GitHub tab, or null to use the first
   * signed-in account in picker order.
   */
  readonly selectedAccount: IAccountIdentity | null

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

  /** The persisted state of the CloneGitHubRepository component. */
  readonly gitHubTabState: IGitHubTabState

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
  readonly kind: 'gitHubTabState'

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

/** What to clone, captured when the user starts cloning. */
interface ICloneRequest {
  readonly tab: CloneRepositoryTab
  readonly url: string
  readonly lastParsedIdentifier: IRepositoryIdentifier | null
  readonly path: string | null

  /**
   * The account selected in the GitHub tab, or null when cloning from the
   * URL tab.
   */
  readonly account: Account | null
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

  /** The signed-in accounts in the order the account picker lists them. */
  private getAccountsInPickerOrder = memoizeOne(
    (accounts: ReadonlyArray<Account>) =>
      groupAccountsByHost(accounts).flatMap(g => g.items.map(i => i.account))
  )

  private mounted = false

  /**
   * The account whose repositories the GitHub tab's selection and filter
   * belong to. See `resetGitHubTabSelectionIfAccountChanged`.
   */
  private gitHubTabAccount: Account | null

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
      gitHubTabState: {
        kind: 'gitHubTabState',
        filterText: '',
        selectedItem: null,
        ...initialBaseTabState,
      },
      urlTabState: {
        kind: 'urlTabState',
        ...initialBaseTabState,
      },
    }

    this.gitHubTabAccount = this.getSelectedAccount()
    this.initializePath()
  }

  public componentDidUpdate(prevProps: ICloneRepositoryProps) {
    if (prevProps.selectedTab !== this.props.selectedTab) {
      this.validatePath()
    }

    if (prevProps.initialURL !== this.props.initialURL) {
      this.updateUrl(this.props.initialURL || '')
    }

    // The effective account can also change without the picker, e.g. when the
    // selected account is signed out while the dialog is open.
    if (
      prevProps.accounts !== this.props.accounts ||
      prevProps.selectedAccount !== this.props.selectedAccount
    ) {
      this.resetGitHubTabSelectionIfAccountChanged(this.getSelectedAccount())
    }

    this.checkIsTopMostDialog(this.props.isTopMost)
  }

  public componentDidMount() {
    this.mounted = true
    const initialURL = this.props.initialURL
    if (initialURL) {
      this.updateUrl(initialURL)
    }

    this.checkIsTopMostDialog(this.props.isTopMost)
  }

  public componentWillUnmount(): void {
    this.mounted = false
    this.checkIsTopMostDialog(false)
  }

  private initializePath = async () => {
    const initialPath = await getDefaultDir()
    const gitHubTabState = { ...this.state.gitHubTabState, path: initialPath }
    const urlTabState = { ...this.state.urlTabState, path: initialPath }
    this.setState({ initialPath, gitHubTabState, urlTabState })

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
        disabled={this.state.loading}
      >
        <TabBar
          onTabClicked={this.onTabClicked}
          selectedIndex={this.props.selectedTab}
        >
          <span id="github-tab">GitHub</span>
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
    return this.props.selectedTab === CloneRepositoryTab.GitHub
      ? 'github-tab'
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
      selectedTab === CloneRepositoryTab.GitHub &&
      this.getSelectedAccount() === null
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

      case CloneRepositoryTab.GitHub: {
        const tabState = this.state.gitHubTabState
        const selectedAccount = this.getSelectedAccount()

        if (selectedAccount === null) {
          return <DialogContent>{this.renderSignIn()}</DialogContent>
        }

        const accountState = this.props.apiRepositories.get(selectedAccount)
        const repositories =
          accountState === undefined ? null : accountState.repositories
        const loading =
          accountState === undefined ? false : accountState.loading

        return (
          <CloneGithubRepository
            path={tabState.path ?? ''}
            account={selectedAccount}
            accounts={this.props.accounts}
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
            onSelectedAccountChanged={this.onSelectedAccountChanged}
          />
        )
      }
      default:
        return assertNever(tab, `Unknown tab: ${tab}`)
    }
  }

  private onSelectedAccountChanged = (account: Account) => {
    this.resetGitHubTabSelectionIfAccountChanged(account)
    this.props.dispatcher.changeCloneRepositoriesAccount(account)
  }

  /**
   * Reset the GitHub tab's selection when it's about to show another
   * account's repositories.
   *
   * The selected repository was listed for the previous account, so it
   * mustn't carry over to an account that may not be able to access it, or
   * that is on another host. The account is tracked rather than compared
   * between renders so that picking an account resets the tab only once, even
   * though the picked account also arrives later through props.
   */
  private resetGitHubTabSelectionIfAccountChanged(account: Account | null) {
    const previous = this.gitHubTabAccount
    const changed =
      account === null || previous === null
        ? account !== previous
        : !isSameAccount(account, previous)
    this.gitHubTabAccount = account

    if (changed) {
      this.resetGitHubTabSelection()
    }
  }

  /**
   * Clear the GitHub tab's selected repository, filter text and URL.
   *
   * The filter is cleared as well since the filter list would otherwise
   * select the first match on its own without reporting it, leaving the
   * repository selected but the URL empty.
   */
  private resetGitHubTabSelection() {
    this.setGitHubTabState({ selectedItem: null, filterText: '' })
    if (this.props.selectedTab === CloneRepositoryTab.GitHub) {
      this.updateUrl('')
    } else {
      this.setTabState({ url: '' }, CloneRepositoryTab.GitHub)
    }
  }

  /**
   * The account to browse and clone with in the GitHub tab: the account last
   * picked while it's still signed in, otherwise the first account in picker
   * order. Null when no account is signed in.
   */
  private getSelectedAccount(): Account | null {
    const accounts = this.getAccountsInPickerOrder(this.props.accounts)
    const { selectedAccount } = this.props
    return (
      accounts.find(a => isSameAccount(a, selectedAccount)) ??
      accounts.at(0) ??
      null
    )
  }

  private getTabState(tab: CloneRepositoryTab): IBaseTabState {
    if (tab === CloneRepositoryTab.GitHub) {
      return this.state.gitHubTabState
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
    if (tab === CloneRepositoryTab.GitHub) {
      this.setState(
        prevState => ({
          gitHubTabState: { ...prevState.gitHubTabState, ...state },
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
    tabState: Pick<IGitHubTabState, K>
  ): void {
    this.setState(prevState => ({
      gitHubTabState: merge(prevState.gitHubTabState, tabState),
    }))
  }

  private renderSignIn() {
    const signInTitle = __DARWIN__ ? 'Sign In' : 'Sign in'
    return (
      <>
        <CallToAction actionTitle={signInTitle} onAction={this.signInDotCom}>
          <div>
            Sign in to your GitHub.com account to access your repositories.
          </div>
        </CallToAction>
        <Row className="sign-in-enterprise">
          <LinkButton onClick={this.signInEnterprise}>
            {__DARWIN__
              ? 'Sign In to GitHub Enterprise'
              : 'Sign in to GitHub Enterprise'}
          </LinkButton>
        </Row>
      </>
    )
  }

  /** Select the account the user signed in to from this dialog. */
  private onSignInResult = (result: SignInResult) => {
    if (result.kind !== 'success') {
      return
    }
    if (this.mounted) {
      this.onSelectedAccountChanged(result.account)
    } else {
      this.props.dispatcher.changeCloneRepositoriesAccount(result.account)
    }
  }

  private signInDotCom = () => {
    this.props.dispatcher.showDotComSignInDialog(this.onSignInResult)
  }

  private signInEnterprise = () => {
    this.props.dispatcher.showEnterpriseSignInDialog(
      undefined,
      this.onSignInResult
    )
  }

  private onFilterTextChanged = (filterText: string) => {
    this.setGitHubTabState({ filterText })
  }

  private onSelectionChanged = (selectedItem: IAPIRepository | null) => {
    this.setGitHubTabState({ selectedItem })
    this.updateUrl(selectedItem === null ? '' : selectedItem.clone_url)
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
      const pathValidation = await this.validateClonePath(path)

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
    const safeName = lastParsedIdentifier
      ? sanitizeCloneName(lastParsedIdentifier.name)
      : null
    const directory = safeName ? Path.join(path, safeName) : path

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

    const safeName = parsed ? sanitizeCloneName(parsed.name) : null

    let newPath: string

    const dirPath = tabState.path
    if (lastParsedIdentifier) {
      if (safeName) {
        newPath = Path.join(Path.dirname(dirPath), safeName)
      } else {
        newPath = Path.dirname(dirPath)
      }
    } else if (safeName) {
      newPath = Path.join(dirPath, safeName)
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

  /** Validate the destination before cloning can create files in it. */
  private async validateClonePath(path: string | null): Promise<null | Error> {
    if (path === null) {
      return new Error(
        'Unable to read path on disk. Please check the path and try again.'
      )
    }

    if (
      __DARWIN__ &&
      Path.basename(Path.resolve(path)).toLowerCase().endsWith('.app')
    ) {
      return new Error(
        'The local path cannot end in .app on macOS. Choose a different folder name to avoid creating an application bundle.'
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
  private async resolveCloneInfo(
    request: ICloneRequest
  ): Promise<IAPIRepositoryCloneInfo | null> {
    const { tab, url, lastParsedIdentifier, account } = request

    if (url.endsWith('.wiki.git')) {
      return { url }
    }

    if (tab === CloneRepositoryTab.Generic) {
      return resolveURLCloneInfo(url, this.props.accounts)
    }

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

    // Capture what's being cloned before going async, so that changes made
    // while the clone is being prepared can't mix one account's repository
    // with another account.
    const request = this.getCloneRequest()
    const { path } = request

    if (path == null) {
      const error = new Error(`Directory could not be created at this path.`)
      this.setState({ loading: false })
      this.setSelectedTabState({ error })
      return
    }

    const pathError = await this.validateClonePath(path)
    if (pathError !== null) {
      this.setState({ loading: false })
      this.setSelectedTabState({ error: pathError })
      return
    }

    const cloneInfo = await this.resolveCloneInfo(request)
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
      this.cloneImpl(request, url.trim(), path, defaultBranch)
    } catch (e) {
      log.error(`CloneRepository: clone failed to complete to ${path}`, e)
      this.setState({ loading: false })
      this.setSelectedTabState({ error: e })
    }
  }

  /** Snapshot the selected tab's clone request. */
  private getCloneRequest(): ICloneRequest {
    const tab = this.props.selectedTab
    const { url, lastParsedIdentifier, path } = this.getTabState(tab)
    return {
      tab,
      url,
      lastParsedIdentifier,
      path,
      account:
        tab === CloneRepositoryTab.GitHub ? this.getSelectedAccount() : null,
    }
  }

  private cloneImpl(
    request: ICloneRequest,
    url: string,
    path: string,
    defaultBranch?: string
  ) {
    const { account } = request
    this.props.dispatcher.clone(
      url,
      path,
      account === null
        ? { defaultBranch }
        : {
            defaultBranch,
            account: { endpoint: account.endpoint, login: account.login },
          }
    )
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
