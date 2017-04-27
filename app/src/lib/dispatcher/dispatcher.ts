import { ipcRenderer, remote } from 'electron'
import { Disposable } from 'event-kit'
import { Account, IAccount } from '../../models/account'
import { Repository, IRepository } from '../../models/repository'
import { WorkingDirectoryFileChange, FileChange } from '../../models/status'
import { DiffSelection } from '../../models/diff'
import { RepositorySection, Popup, PopupType, Foldout, FoldoutType } from '../app-state'
import { Action } from './actions'
import { AppStore } from './app-store'
import { CloningRepository } from './cloning-repositories-store'
import { Branch } from '../../models/branch'
import { Commit } from '../../models/commit'
import { IAPIUser } from '../../lib/api'
import { GitHubRepository } from '../../models/github-repository'
import { ICommitMessage } from './git-store'
import { executeMenuItem } from '../../ui/main-process-proxy'
import { AppMenu, ExecutableMenuItem } from '../../models/app-menu'
import { ILaunchStats } from '../stats'
import { fatalError } from '../fatal-error'
import { structuralEquals } from '../equality'
import { isGitOnPath } from '../open-shell'
import { uuid } from '../uuid'

/**
 * Extend Error so that we can create new Errors with a callstack different from
 * the callsite.
 */
class IPCError extends Error {
  public readonly message: string
  public readonly stack: string

  public constructor(name: string, message: string, stack: string) {
    super(name)
    this.name = name
    this.message = message
    this.stack = stack
  }
}

interface IResult<T> {
  type: 'result'
  readonly result: T
}

interface IError {
  type: 'error'
  readonly error: Error
}

type IPCResponse<T> = IResult<T> | IError

/**
 * An error handler function.
 *
 * If the returned {Promise} returns an error, it will be passed to the next
 * error handler. If it returns null, error propagation is halted.
 */
export type ErrorHandler = (error: Error, dispatcher: Dispatcher) => Promise<Error | null>

/**
 * The Dispatcher acts as the hub for state. The StateHub if you will. It
 * decouples the consumer of state from where/how it is stored.
 */
export class Dispatcher {
  private appStore: AppStore

  private readonly errorHandlers = new Array<ErrorHandler>()

  public constructor(appStore: AppStore) {
    this.appStore = appStore

    appStore.onDidAuthenticate((user) => {
      this.addAccount(user)
    })

    ipcRenderer.on('shared/did-update', (event, args) => this.onSharedDidUpdate(event, args))
  }

  public async loadInitialState(): Promise<void> {
    const users = await this.loadUsers()
    const repositories = await this.loadRepositories()
    this.appStore._loadFromSharedProcess(users, repositories)
  }

  private dispatchToSharedProcess<T>(action: Action): Promise<T> {
    return this.send(action.name, action)
  }

  private send<T>(name: string, args: Object): Promise<T> {
    return new Promise<T>((resolve, reject) => {

      const requestGuid = uuid()
      ipcRenderer.once(`shared/response/${requestGuid}`, (event: any, args: any[]) => {
        const response: IPCResponse<T> = args[0]
        if (response.type === 'result') {
          resolve(response.result)
        } else {
          const errorInfo = response.error
          const error = new IPCError(errorInfo.name, errorInfo.message, errorInfo.stack || '')
          if (__DEV__) {
            console.error(`Error from IPC in response to ${name}:`)
            console.error(error)
          }

          reject(error)
        }
      })

      ipcRenderer.send('shared/request', [ { guid: requestGuid, name, args } ])
    })
  }

  private onSharedDidUpdate(event: Electron.IpcRendererEvent, args: any[]) {
    const state: { repositories: ReadonlyArray<IRepository>, account: ReadonlyArray<IAccount> } = args[0].state
    const inflatedAccounts = state.account.map(Account.fromJSON)
    const inflatedRepositories = state.repositories.map(Repository.fromJSON)
    this.appStore._loadFromSharedProcess(inflatedAccounts, inflatedRepositories)
  }

  /** Get the users */
  private async loadUsers(): Promise<ReadonlyArray<Account>> {
    const json = await this.dispatchToSharedProcess<ReadonlyArray<IAccount>>({ name: 'get-accounts' })
    return json.map(Account.fromJSON)
  }

  /** Get the repositories the user has added to the app. */
  private async loadRepositories(): Promise<ReadonlyArray<Repository>> {
    const json = await this.dispatchToSharedProcess<ReadonlyArray<IRepository>>({ name: 'get-repositories' })
    return json.map(Repository.fromJSON)
  }

  /**
   * Add the repositories at the given paths. If a path isn't a repository, then
   * this will post an error to that affect.
   */
  public async addRepositories(paths: ReadonlyArray<string>): Promise<ReadonlyArray<Repository>> {
    const validatedPaths = new Array<string>()
    for (const path of paths) {
      const validatedPath = await this.appStore._validatedRepositoryPath(path)
      if (validatedPath) {
        validatedPaths.push(validatedPath)
      } else {
        this.postError({ name: 'add-repository', message: `${path} isn't a git repository.` })
      }
    }

    const json = await this.dispatchToSharedProcess<ReadonlyArray<IRepository>>({ name: 'add-repositories', paths: validatedPaths })
    const addedRepositories = json.map(Repository.fromJSON)

    const refreshedRepositories = new Array<Repository>()
    for (const repository of addedRepositories) {
      const refreshedRepository = await this.refreshGitHubRepositoryInfo(repository)
      refreshedRepositories.push(refreshedRepository)
    }

    return refreshedRepositories
  }

  /** Remove the repositories represented by the given IDs from local storage. */
  public async removeRepositories(repositories: ReadonlyArray<Repository | CloningRepository>): Promise<void> {
    const localRepositories = repositories.filter(r => r instanceof Repository) as ReadonlyArray<Repository>
    const cloningRepositories = repositories.filter(r => r instanceof CloningRepository) as ReadonlyArray<CloningRepository>
    cloningRepositories.forEach(r => {
      this.appStore._removeCloningRepository(r)
    })

    const repositoryIDs = localRepositories.map(r => r.id)
    await this.dispatchToSharedProcess<ReadonlyArray<number>>({ name: 'remove-repositories', repositoryIDs })

    this.showFoldout({ type: FoldoutType.Repository })
  }

  /** Refresh the associated GitHub repository. */
  private async refreshGitHubRepositoryInfo(repository: Repository): Promise<Repository> {
    const refreshedRepository = await this.appStore._repositoryWithRefreshedGitHubRepository(repository)

    if (structuralEquals(refreshedRepository, repository)) {
      return refreshedRepository
    }

    const repo = await this.dispatchToSharedProcess<IRepository>({ name: 'update-github-repository', repository: refreshedRepository })
    return Repository.fromJSON(repo)
  }

  /** Update the repository's `missing` flag. */
  public async updateRepositoryMissing(repository: Repository, missing: boolean): Promise<Repository> {
    const repo = await this.dispatchToSharedProcess<IRepository>({ name: 'update-repository-missing', repository, missing })
    return Repository.fromJSON(repo)
  }

  /** Load the history for the repository. */
  public loadHistory(repository: Repository): Promise<void> {
    return this.appStore._loadHistory(repository)
  }

  /** Load the next batch of history for the repository. */
  public loadNextHistoryBatch(repository: Repository): Promise<void> {
    return this.appStore._loadNextHistoryBatch(repository)
  }

  /** Load the changed files for the current history selection. */
  public loadChangedFilesForCurrentSelection(repository: Repository): Promise<void> {
    return this.appStore._loadChangedFilesForCurrentSelection(repository)
  }

  /**
   * Change the selected commit in the history view.
   *
   * @param repository The currently active repository instance
   *
   * @param sha The object id of one of the commits currently
   *            the history list, represented as a SHA-1 hash
   *            digest. This should match exactly that of Commit.Sha
   */
  public changeHistoryCommitSelection(repository: Repository, sha: string): Promise<void> {
    return this.appStore._changeHistoryCommitSelection(repository, sha)
  }

  /**
   * Change the selected changed file in the history view.
   *
   * @param repository The currently active repository instance
   *
   * @param file A FileChange instance among those available in
   *            IHistoryState.changedFiles
   */
  public changeHistoryFileSelection(repository: Repository, file: FileChange): Promise<void> {
    return this.appStore._changeHistoryFileSelection(repository, file)
  }

  /** Select the repository. */
  public async selectRepository(repository: Repository | CloningRepository): Promise<Repository | null> {
    let repo = await this.appStore._selectRepository(repository)

    if (repository instanceof Repository) {
      repo = await this.refreshGitHubRepositoryInfo(repository)
    }

    return repo
  }

  /** Load the working directory status. */
  public loadStatus(repository: Repository): Promise<void> {
    return this.appStore._loadStatus(repository)
  }

  /** Change the selected section in the repository. */
  public changeRepositorySection(repository: Repository, section: RepositorySection): Promise<void> {
    return this.appStore._changeRepositorySection(repository, section)
  }

  /** Change the currently selected file in Changes. */
  public changeChangesSelection(repository: Repository, selectedFile: WorkingDirectoryFileChange): Promise<void> {
    return this.appStore._changeChangesSelection(repository, selectedFile)
  }

  /**
   * Commit the changes which were marked for inclusion, using the given commit
   * summary and description.
   */
  public async commitIncludedChanges(repository: Repository, message: ICommitMessage): Promise<boolean> {
    return this.appStore._commitIncludedChanges(repository, message)
  }

  /** Change the file's includedness. */
  public changeFileIncluded(repository: Repository, file: WorkingDirectoryFileChange, include: boolean): Promise<void> {
    return this.appStore._changeFileIncluded(repository, file, include)
  }

  /** Change the file's line selection state. */
  public changeFileLineSelection(repository: Repository, file: WorkingDirectoryFileChange, diffSelection: DiffSelection): Promise<void> {
    return this.appStore._changeFileLineSelection(repository, file, diffSelection)
  }

  /** Change the Include All state. */
  public changeIncludeAllFiles(repository: Repository, includeAll: boolean): Promise<void> {
    return this.appStore._changeIncludeAllFiles(repository, includeAll)
  }

  /**
   * Refresh the repository. This would be used, e.g., when the app gains focus.
   */
  public refreshRepository(repository: Repository): Promise<void> {
    return this.appStore._refreshRepository(repository)
  }

  /** Show the popup. This will close any current popup. */
  public showPopup(popup: Popup): Promise<void> {
    return this.appStore._showPopup(popup)
  }

  /** Close the current popup. */
  public closePopup(): Promise<void> {
    return this.appStore._closePopup()
  }

  /** Show the foldout. This will close any current popup. */
  public showFoldout(foldout: Foldout): Promise<void> {
    return this.appStore._showFoldout(foldout)
  }

  /** Close the current foldout. */
  public closeFoldout(foldout: FoldoutType): Promise<void> {
    return this.appStore._closeFoldout(foldout)
  }

  /** 
   * Create a new branch from the given starting point and check it out.
   * 
   * If the startPoint argument is omitted the new branch will be created based
   * off of the current state of HEAD.
   */
  public createBranch(repository: Repository, name: string, startPoint?: string): Promise<Repository> {
    return this.appStore._createBranch(repository, name, startPoint)
  }

  /** Check out the given branch. */
  public checkoutBranch(repository: Repository, name: string): Promise<Repository> {
    return this.appStore._checkoutBranch(repository, name)
  }

  /**
   * Perform a function which may need authentication on a repository. This may
   * first update the GitHub association for the repository.
   */
  private async withAuthenticatingUser<T>(repository: Repository, fn: (repository: Repository, account: Account | null) => Promise<T>): Promise<T> {
    let updatedRepository = repository
    let account = this.appStore.getAccountForRepository(updatedRepository)
    // If we don't have a user association, it might be because we haven't yet
    // tried to associate the repository with a GitHub repository, or that
    // association is out of date. So try again before we bail on providing an
    // authenticating user.
    if (!account) {
      updatedRepository = await this.refreshGitHubRepositoryInfo(repository)
      account = this.appStore.getAccountForRepository(updatedRepository)
    }

    return fn(updatedRepository, account)
  }

  /** Push the current branch. */
  public async push(repository: Repository): Promise<void> {
    return this.withAuthenticatingUser(repository, (repo, user) =>
      this.appStore._push(repo, user)
    )
  }

  /** Pull the current branch. */
  public async pull(repository: Repository): Promise<void> {
    return this.withAuthenticatingUser(repository, (repo, user) =>
      this.appStore._pull(repo, user)
    )
  }

  /** Fetch a specific refspec for the repository. */
  public fetchRefspec(repository: Repository, fetchspec: string): Promise<void> {
    return this.withAuthenticatingUser(repository, (repo, user) => {
      return this.appStore.fetchRefspec(repo, fetchspec, user)
    })
  }

  /** Fetch all refs for the repository */
  public fetch(repository: Repository): Promise<void> {
    return this.withAuthenticatingUser(repository, (repo, user) =>
      this.appStore.fetch(repo, user)
    )
  }

  /** Publish the repository to GitHub with the given properties. */
  public async publishRepository(repository: Repository, name: string, description: string, private_: boolean, account: Account, org: IAPIUser | null): Promise<Repository> {
    await this.appStore._publishRepository(repository, name, description, private_, account, org)
    return this.refreshGitHubRepositoryInfo(repository)
  }

  /**
   * Post the given error. This will send the error through the standard error
   * handler machinery.
   */
  public async postError(error: Error): Promise<void> {
    let currentError: Error | null = error
    for (let i = this.errorHandlers.length - 1; i >= 0; i--) {
      const handler = this.errorHandlers[i]
      currentError = await handler(currentError, this)

      if (!currentError) { break }
    }

    if (currentError) {
      fatalError(`Unhandled error ${currentError}. This shouldn't happen! All errors should be handled, even if it's just by the default handler.`)
    }
  }

  /**
   * Post the given error. Note that this bypasses the standard error handler
   * machinery. You probably don't want that. See `Dispatcher.postError`
   * instead.
   */
  public presentError(error: Error): Promise<void> {
    return this.appStore._pushError(error)
  }

  /** Clear the given error. */
  public clearError(error: Error): Promise<void> {
    return this.appStore._clearError(error)
  }

  /**
   * Clone a missing repository to the previous path, and update it's
   * state in the repository list if the clone completes without error.
   */
  public async cloneAgain(url: string, path: string, account: Account | null): Promise<void> {
    const { promise, repository } = this.appStore._clone(url, path, { account })
    await this.selectRepository(repository)
    const success = await promise
    if (!success) { return }

    // In the background the shared process has updated the repository list.
    // To ensure a smooth transition back, we should lookup the new repository
    // and update it's state after the clone has completed
    const repositories = await this.loadRepositories()
    const found = repositories.find(r => r.path === path) || null

    if (found) {
      const updatedRepository = await this.updateRepositoryMissing(found, false)
      await this.selectRepository(updatedRepository)
    }
 }

  /** Clone the repository to the path. */
  public async clone(url: string, path: string, options: { account: Account | null, branch?: string }): Promise<Repository | null> {
    const { promise, repository } = this.appStore._clone(url, path, options)
    await this.selectRepository(repository)
    const success = await promise
    // TODO: this exit condition is not great, bob
    if (!success) { return Promise.resolve(null) }

    const addedRepositories = await this.addRepositories([ path ])
    const addedRepository = addedRepositories[0]
    await this.selectRepository(addedRepository)
    return addedRepository
  }

  /** Rename the branch to a new name. */
  public renameBranch(repository: Repository, branch: Branch, newName: string): Promise<void> {
    return this.appStore._renameBranch(repository, branch, newName)
  }

  /**
   * Delete the branch. This will delete both the local branch and the remote
   * branch, and then check out the default branch.
   */
  public deleteBranch(repository: Repository, branch: Branch): Promise<void> {
    return this.withAuthenticatingUser(repository, (repo, user) =>
      this.appStore._deleteBranch(repo, branch, user)
    )
  }

  /** Discard the changes to the given files. */
  public discardChanges(repository: Repository, files: ReadonlyArray<WorkingDirectoryFileChange>): Promise<void> {
    return this.appStore._discardChanges(repository, files)
  }

  /** Undo the given commit. */
  public undoCommit(repository: Repository, commit: Commit): Promise<void> {
    return this.appStore._undoCommit(repository, commit)
  }

  /**
   * Set the width of the repository sidebar to the given
   * value. This affects the changes and history sidebar
   * as well as the first toolbar section which contains
   * repo selection on all platforms and repo selection and
   * app menu on Windows.
   */
  public setSidebarWidth(width: number): Promise<void> {
    return this.appStore._setSidebarWidth(width)
  }

  /**
   * Set the update banner's visibility
   */
  public setUpdateBannerVisibility(isVisible: boolean) {
    return this.appStore._setUpdateBannerVisibility(isVisible)
  }

  /**
   * Reset the width of the repository sidebar to its default
   * value. This affects the changes and history sidebar
   * as well as the first toolbar section which contains
   * repo selection on all platforms and repo selection and
   * app menu on Windows.
   */
  public resetSidebarWidth(): Promise<void> {
    return this.appStore._resetSidebarWidth()
  }

  /**
   * Set the width of the commit summary column in the
   * history view to the given value.
   */
  public setCommitSummaryWidth(width: number): Promise<void> {
    return this.appStore._setCommitSummaryWidth(width)
  }

  /**
   * Reset the width of the commit summary column in the
   * history view to its default value.
   */
  public resetCommitSummaryWidth(): Promise<void> {
    return this.appStore._resetCommitSummaryWidth()
  }

  /** Update the repository's issues from GitHub. */
  public updateIssues(repository: GitHubRepository): Promise<void> {
    return this.appStore._updateIssues(repository)
  }

  /** End the Welcome flow. */
  public endWelcomeFlow(): Promise<void> {
    return this.appStore._endWelcomeFlow()
  }

  /**
   * Set the commit summary and description for a work-in-progress
   * commit in the changes view for a particular repository.
   */
  public setCommitMessage(repository: Repository, message: ICommitMessage | null): Promise<void> {
    return this.appStore._setCommitMessage(repository, message)
  }

  /** Add the account to the app. */
  public async addAccount(account: Account): Promise<void> {
    return this.dispatchToSharedProcess<void>({ name: 'add-account', account })
  }

  /** Remove the given account from the app. */
  public removeAccount(account: Account): Promise<void> {
    return this.dispatchToSharedProcess<void>({ name: 'remove-account', account })
  }

  /**
   * Ask the dispatcher to apply a transformation function to the current
   * state of the application menu.
   *
   * Since the dispatcher is asynchronous it's possible for components
   * utilizing the menu state to have an out-of-date view of the state
   * of the app menu which is why they're not allowed to transform it
   * directly.
   *
   * To work around potential race conditions consumers instead pass a
   * delegate which receives the updated application menu and allows
   * them to perform the necessary state transitions. The AppMenu instance
   * is itself immutable but does offer transformation methods and in
   * order for the state to be properly updated the delegate _must_ return
   * the latest transformed instance of the AppMenu.
   */
  public setAppMenuState(update: (appMenu: AppMenu) => AppMenu): Promise<void> {
    return this.appStore._setAppMenuState(update)
  }

  /**
   * Tell the main process to execute (i.e. simulate a click of) the given menu item.
   */
  public executeMenuItem(item: ExecutableMenuItem): Promise<void> {
    executeMenuItem(item)
    return Promise.resolve()
  }

  /**
   * Set whether or not to to add a highlight class to the app menu toolbar icon.
   * Used to highlight the button when the Alt key is pressed.
   *
   * Only applicable on non-macOS platforms.
   */
  public setAccessKeyHighlightState(highlight: boolean): Promise<void> {
    return this.appStore._setAccessKeyHighlightState(highlight)
  }

  /** Merge the named branch into the current branch. */
  public mergeBranch(repository: Repository, branch: string): Promise<void> {
    return this.appStore._mergeBranch(repository, branch)
  }

  /** Record the given launch stats. */
  public recordLaunchStats(stats: ILaunchStats): Promise<void> {
    return this.appStore._recordLaunchStats(stats)
  }

  /** Report any stats if needed. */
  public reportStats(): Promise<void> {
    return this.appStore._reportStats()
  }

  /** Changes the URL for the remote that matches the given name  */
  public setRemoteURL(repository: Repository, name: string, url: string): Promise<void> {
    return this.appStore._setRemoteURL(repository, name, url)
  }

  /** Open the URL in a browser */
  public openInBrowser(url: string) {
    return this.appStore._openInBrowser(url)
  }

  /** Add the pattern to the repository's gitignore. */
  public ignore(repository: Repository, pattern: string): Promise<void> {
    return this.appStore._ignore(repository, pattern)
  }

  /** Opens a Git-enabled terminal setting the working directory to the repository path */
  public async openShell(path: string): Promise<void> {
    const gitFound = await isGitOnPath()
    if (gitFound) {
      this.appStore._openShell(path)
    } else {
      this.appStore._showPopup({ type: PopupType.InstallGit, path })
    }
  }

  /**
   * Persist the given content to the repository's root .gitignore.
   *
   * If the repository root doesn't contain a .gitignore file one
   * will be created, otherwise the current file will be overwritten.
   */
  public async saveGitIgnore(repository: Repository, text: string): Promise<void> {
    await this.appStore._saveGitIgnore(repository, text)
    await this.appStore._refreshRepository(repository)
  }

  /**
   * Read the contents of the repository's .gitignore.
   *
   * Returns a promise which will either be rejected or resolved
   * with the contents of the file. If there's no .gitignore file
   * in the repository root the promise will resolve with null.
   */
  public async readGitIgnore(repository: Repository): Promise<string | null> {
    return this.appStore._readGitIgnore(repository)
  }

  /** Set whether the user has opted out of stats reporting. */
  public setStatsOptOut(optOut: boolean): Promise<void> {
    return this.appStore.setStatsOptOut(optOut)
  }

  /**
   * Clear any in-flight sign in state and return to the
   * initial (no sign-in) state.
   */
  public resetSignInState(): Promise<void> {
    return this.appStore._resetSignInState()
  }

  /**
   * Initiate a sign in flow for github.com. This will put the store
   * in the Authentication step ready to receive user credentials.
   */
  public beginDotComSignIn(): Promise<void> {
    return this.appStore._beginDotComSignIn()
  }

  /**
   * Initiate a sign in flow for a GitHub Enterprise instance. This will
   * put the store in the EndpointEntry step ready to receive the url
   * to the enterprise instance.
   */
  public beginEnterpriseSignIn(): Promise<void> {
    return this.appStore._beginEnterpriseSignIn()
  }

  /**
   * Attempt to advance from the EndpointEntry step with the given endpoint
   * url. This method must only be called when the store is in the authentication
   * step or an error will be thrown.
   *
   * The provided endpoint url will be validated for syntactic correctness as
   * well as connectivity before the promise resolves. If the endpoint url is
   * invalid or the host can't be reached the promise will be rejected and the
   * sign in state updated with an error to be presented to the user.
   *
   * If validation is successful the store will advance to the authentication
   * step.
   */
  public setSignInEndpoint(url: string): Promise<void> {
    return this.appStore._setSignInEndpoint(url)
  }

  /**
   * Attempt to advance from the authentication step using a username
   * and password. This method must only be called when the store is
   * in the authentication step or an error will be thrown. If the
   * provided credentials are valid the store will either advance to
   * the Success step or to the TwoFactorAuthentication step if the
   * user has enabled two factor authentication.
   *
   * If an error occurs during sign in (such as invalid credentials)
   * the authentication state will be updated with that error so that
   * the responsible component can present it to the user.
   */
  public setSignInCredentials(username: string, password: string): Promise<void> {
    return this.appStore._setSignInCredentials(username, password)
  }

  /**
   * Initiate an OAuth sign in using the system configured browser.
   * This method must only be called when the store is in the authentication
   * step or an error will be thrown.
   *
   * The promise returned will only resolve once the user has successfully
   * authenticated. If the user terminates the sign-in process by closing
   * their browser before the protocol handler is invoked, by denying the
   * protocol handler to execute or by providing the wrong credentials
   * this promise will never complete.
   */
  public requestBrowserAuthentication(): Promise<void> {
    return this.appStore._requestBrowserAuthentication()
  }

  /**
   * Attempt to complete the sign in flow with the given OTP token.\
   * This method must only be called when the store is in the
   * TwoFactorAuthentication step or an error will be thrown.
   *
   * If the provided token is valid the store will advance to
   * the Success step.
   *
   * If an error occurs during sign in (such as invalid credentials)
   * the authentication state will be updated with that error so that
   * the responsible component can present it to the user.
   */
  public setSignInOTP(otp: string): Promise<void> {
    return this.appStore._setSignInOTP(otp)
  }

  /**
   * Launch a sign in dialog for authenticating a user with
   * GitHub.com.
   */
  public async showDotComSignInDialog(): Promise<void> {
    await this.appStore._beginDotComSignIn()
    await this.appStore._showPopup({ type: PopupType.SignIn })
  }

  /**
   * Launch a sign in dialog for authenticating a user with
   * a GitHub Enterprise instance.
   */
  public async showEnterpriseSignInDialog(): Promise<void> {
    await this.appStore._beginEnterpriseSignIn()
    await this.appStore._showPopup({ type: PopupType.SignIn })
  }

  /**
   * Register a new error handler.
   *
   * Error handlers are called in order starting with the most recently
   * registered handler. The error which the returned {Promise} resolves to is
   * passed to the next handler, etc. If the handler's {Promise} resolves to
   * null, error propagation is halted.
   */
  public registerErrorHandler(handler: ErrorHandler): Disposable {
    this.errorHandlers.push(handler)

    return new Disposable(() => {
      const i = this.errorHandlers.indexOf(handler)
      if (i >= 0) {
        this.errorHandlers.splice(i, 1)
      }
    })
  }

  /**
   * Update the location of an existing repository and clear the missing flag.
   */
  public async relocateRepository(repository: Repository): Promise<void> {
    const directories = remote.dialog.showOpenDialog({
      properties: [ 'openDirectory' ],
    })

    if (directories && directories.length > 0) {
      const newPath = directories[0]
      await this.updateRepositoryPath(repository, newPath)
    }
  }

  /** Update the repository's path. */
  private async updateRepositoryPath(repository: Repository, path: string): Promise<void> {
    await this.dispatchToSharedProcess<IRepository>({ name: 'update-repository-path', repository, path })
  }
}
