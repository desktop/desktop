import { ipcRenderer } from 'electron'
import { User, IUser } from '../../models/user'
import { Repository, IRepository } from '../../models/repository'
import { WorkingDirectoryFileChange, FileChange } from '../../models/status'
import { DiffSelection } from '../../models/diff'
import { guid } from '../guid'
import { RepositorySection, Popup, Foldout, IAppError } from '../app-state'
import { Action } from './actions'
import { AppStore } from './app-store'
import { CloningRepository } from './cloning-repositories-store'
import { URLActionType } from '../parse-url'
import { Branch, Commit } from '../local-git-operations'
import { IAPIUser } from '../../lib/api'
import { GitHubRepository } from '../../models/github-repository'
import { ICommitMessage } from './git-store'

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
 * The Dispatcher acts as the hub for state. The StateHub if you will. It
 * decouples the consumer of state from where/how it is stored.
 */
export class Dispatcher {
  private appStore: AppStore

  public constructor(appStore: AppStore) {
    this.appStore = appStore

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
    let resolve: ((value: T) => void) | null = null
    let reject: ((error: Error) => void) | null = null
    const promise = new Promise<T>((_resolve, _reject) => {
      resolve = _resolve
      reject = _reject
    })

    const requestGuid = guid()
    ipcRenderer.once(`shared/response/${requestGuid}`, (event: any, args: any[]) => {
      const response: IPCResponse<T> = args[0]
      if (response.type === 'result') {
        resolve!(response.result)
      } else {
        const errorInfo = response.error
        const error = new IPCError(errorInfo.name, errorInfo.message, errorInfo.stack || '')
        if (__DEV__) {
          console.error(`Error from IPC in response to ${name}:`)
          console.error(error)
        }

        reject!(error)
      }
    })

    ipcRenderer.send('shared/request', [ { guid: requestGuid, name, args } ])
    return promise
  }

  private onSharedDidUpdate(event: Electron.IpcRendererEvent, args: any[]) {
    const state: {repositories: ReadonlyArray<IRepository>, users: ReadonlyArray<IUser>} = args[0].state
    const inflatedUsers = state.users.map(User.fromJSON)
    const inflatedRepositories = state.repositories.map(Repository.fromJSON)
    this.appStore._loadFromSharedProcess(inflatedUsers, inflatedRepositories)
  }

  /** Get the users */
  private async loadUsers(): Promise<ReadonlyArray<User>> {
    const json = await this.dispatchToSharedProcess<ReadonlyArray<IUser>>({ name: 'get-users' })
    return json.map(User.fromJSON)
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
  }

  /**
   * Request the user approve our OAuth request. This will open their browser.
   *
   * The returned promise will only resolve once the entire OAuth flow has been
   * completed. If the user cancels the OAuth flow, the promise will never
   * resolve.
   */
  public requestOAuth(): Promise<IUser> {
    return this.dispatchToSharedProcess<IUser>({ name: 'request-oauth' })
  }

  /** Refresh the associated GitHub repository. */
  public async refreshGitHubRepositoryInfo(repository: Repository): Promise<void> {
    const refreshedRepository = await this.appStore._repositoryWithRefreshedGitHubRepository(repository)
    if (refreshedRepository === repository) { return }

    return this.dispatchToSharedProcess<void>({ name: 'update-github-repository', repository: refreshedRepository })
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
  public selectRepository(repository: Repository | CloningRepository): Promise<void> {
    return this.appStore._selectRepository(repository)
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
  public commitIncludedChanges(repository: Repository, message: ICommitMessage): Promise<void> {
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
  public closeFoldout(): Promise<void> {
    return this.appStore._closeFoldout()
  }

  /** Create a new branch from the given starting point and check it out. */
  public createBranch(repository: Repository, name: string, startPoint: string): Promise<void> {
    return this.appStore._createBranch(repository, name, startPoint)
  }

  /** Check out the given branch. */
  public checkoutBranch(repository: Repository, name: string): Promise<void> {
    return this.appStore._checkoutBranch(repository, name)
  }

  /** Push the current branch. */
  public push(repository: Repository): Promise<void> {
    return this.appStore._push(repository)
  }

  /** Pull the current branch. */
  public pull(repository: Repository): Promise<void> {
    return this.appStore._pull(repository)
  }

  /** Publish the repository to GitHub with the given properties. */
  public async publishRepository(repository: Repository, name: string, description: string, private_: boolean, account: User, org: IAPIUser | null): Promise<void> {
    await this.appStore._publishRepository(repository, name, description, private_, account, org)
    return this.refreshGitHubRepositoryInfo(repository)
  }

  /** Post the given error. */
  public postError(error: IAppError): Promise<void> {
    return this.appStore._postError(error)
  }

  /** Clear the given error. */
  public clearError(error: IAppError): Promise<void> {
    return this.appStore._clearError(error)
  }

  /** Handle the URL action. Returns whether the shared process handled it. */
  public handleURLAction(action: URLActionType): Promise<boolean> {
    return this.dispatchToSharedProcess<boolean>({ name: 'url-action', action })
  }

  /** Clone the repository to the path. */
  public async clone(url: string, path: string, user: User | null): Promise<void> {
    const { promise, repository } = this.appStore._clone(url, path, user)
    await this.selectRepository(repository)
    await promise

    const addedRepositories = await this.addRepositories([ path ])
    await this.selectRepository(addedRepositories[0])
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
    return this.appStore._deleteBranch(repository, branch)
  }

  /** Discard the changes to the given files. */
  public discardChanges(repository: Repository, files: ReadonlyArray<WorkingDirectoryFileChange>): Promise<void> {
    return this.appStore._discardChanges(repository, files)
  }

  /** Undo the given commit. */
  public undoCommit(repository: Repository, commit: Commit): Promise<void> {
    return this.appStore._undoCommit(repository, commit)
  }

  /** Clear the contextual commit message. */
  public clearContextualCommitMessage(repository: Repository): Promise<void> {
    return this.appStore._clearContextualCommitMessage(repository)
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
   * Reset the width of the repository sidebar to its default
   * value. This affects the changes and history sidebar
   * as well as the first toolbar section which contains
   * repo selection on all platforms and repo selection and
   * app menu on Windows.
   */
  public resetSidebarWidth(): Promise<void> {
    return this.appStore._resetSidebarWidth()
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
}
