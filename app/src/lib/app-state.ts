import { User } from '../models/user'
import { CommitIdentity } from '../models/commit-identity'
import { IDiff } from '../models/diff'
import { Repository } from '../models/repository'
import { IAheadBehind } from './git'
import { Branch } from '../models/branch'
import { Tip } from '../models/tip'
import { Commit } from '../models/commit'
import { FileChange, WorkingDirectoryStatus, WorkingDirectoryFileChange } from '../models/status'
import { CloningRepository, ICloningRepositoryState, IGitHubUser } from './dispatcher'
import { ICommitMessage } from './dispatcher/git-store'
import { IMenu } from '../models/app-menu'
import { IRemote } from '../models/remote'

export { ICloningRepositoryState }
export { ICommitMessage }
export { IAheadBehind }

export enum SelectionType {
  Repository,
  CloningRepository,
}

export type PossibleSelections = { type: SelectionType.Repository, repository: Repository, state: IRepositoryState } |
                                 { type: SelectionType.CloningRepository, repository: CloningRepository, state: ICloningRepositoryState }

/** All of the shared app state. */
export interface IAppState {
  readonly users: ReadonlyArray<User>
  readonly repositories: ReadonlyArray<Repository | CloningRepository>

  readonly selectedState: PossibleSelections | null

  readonly showWelcomeFlow: boolean
  readonly loading: boolean
  readonly currentPopup: Popup | null
  readonly currentFoldout: Foldout | null

  /**
   * A list of currently open menus with their selected items
   * in the application menu.
   *
   * The semantics around what constitues an open menu and how
   * selection works is defined by the AppMenu class and the
   * individual components transforming that state.
   *
   * Note that as long as the renderer has received an application
   * menu from the main process there will always be one menu
   * "open", that is the root menu which can't be closed. In other
   * words, a non-zero length appMenuState does not imply that the
   * application menu should be visible. Currently thats defined by
   * whether the app menu is open as a foldout (see currentFoldout).
   *
   * Not applicable on macOS unless the in-app application menu has
   * been explicitly enabled for testing purposes.
   */
  readonly appMenuState: ReadonlyArray<IMenu>

  readonly errors: ReadonlyArray<IAppError>

  /** Map from the emoji shortcut (e.g., :+1:) to the image's local path. */
  readonly emoji: Map<string, string>

  /**
   * The width of the repository sidebar.
   *
   * This affects the changes and history sidebar
   * as well as the first toolbar section which contains
   * repo selection on all platforms and repo selection and
   * app menu on Windows.
   *
   * Lives on IAppState as opposed to IRepositoryState
   * because it's used in the toolbar as well as the
   * repository.
   */
  readonly sidebarWidth: number

  /** The width of the commit summary column in the history view */
  readonly commitSummaryWidth: number

  /** Whether we should hide the toolbar (and show inverted window controls) */
  readonly titleBarStyle: 'light' | 'dark'

  /**
   * Used to add a highlight class to the app menu toolbar icon
   * when the Alt key is pressed. Only applicable on non-macOS
   * platforms.
   */
  readonly highlightAppMenuToolbarButton: boolean
}

export interface IAppError {
  /** The name of the error. This is for application use only. */
  readonly name: string

  /** The user-facing message. */
  readonly message: string
}

export enum PopupType {
  CreateBranch = 1,
  AddRepository,
  RenameBranch,
  DeleteBranch,
  ConfirmDiscardChanges,
  UpdateAvailable,
  Preferences,
  MergeBranch,
  RepositorySettings,
}

export type Popup = { type: PopupType.AddRepository } |
                    { type: PopupType.RenameBranch, repository: Repository, branch: Branch } |
                    { type: PopupType.DeleteBranch, repository: Repository, branch: Branch } |
                    { type: PopupType.ConfirmDiscardChanges, repository: Repository, files: ReadonlyArray<WorkingDirectoryFileChange> } |
                    { type: PopupType.UpdateAvailable } |
                    { type: PopupType.Preferences } |
                    { type: PopupType.MergeBranch, repository: Repository } |
                    { type: PopupType.RepositorySettings, repository: Repository }

export enum FoldoutType {
  Repository,
  Branch,
  AppMenu,
  Publish,
}

export type Foldout =
  { type: FoldoutType.Repository } |
  { type: FoldoutType.Branch, expandCreateForm?: boolean } |
  { type: FoldoutType.AppMenu, enableAccessKeyNavigation: boolean, openedWithAccessKey?: boolean } |
  { type: FoldoutType.Publish }

export enum RepositorySection {
  Changes,
  History
}

export interface IRepositoryState {
  readonly historyState: IHistoryState
  readonly changesState: IChangesState
  readonly selectedSection: RepositorySection

  /**
   * The name and email that will be used for the author info
   * when committing barring any race where user.name/user.email is
   * updated between us reading it and a commit being made
   * (ie we don't currently use this value explicitly when committing)
   */
  readonly commitAuthor: CommitIdentity | null

  readonly branchesState: IBranchesState

  /**
   * Mapping from lowercased email addresses to the associated GitHub user. Note
   * that an email address may not have an associated GitHub user, or the user
   * may still be loading.
   */
  readonly gitHubUsers: Map<string, IGitHubUser>

  /** The commits loaded, keyed by their full SHA. */
  readonly commits: Map<string, Commit>

  /**
   * The ordered local commit SHAs. The commits themselves can be looked up in
   * `commits.`
   */
  readonly localCommitSHAs: ReadonlyArray<string>

  /** The remote currently associated with the repository, if defined in the configuration */
  readonly remote: IRemote | null

  /** The state of the current branch in relation to its upstream. */
  readonly aheadBehind: IAheadBehind | null

  /** Is a push/pull/update in progress? */
  readonly pushPullInProgress: boolean

  /** The date the repository was last fetched. */
  readonly lastFetched: Date | null
}

export interface IBranchesState {
  readonly tip: Tip
  readonly defaultBranch: Branch | null
  readonly allBranches: ReadonlyArray<Branch>
  readonly recentBranches: ReadonlyArray<Branch>
}

export interface IHistorySelection {
  readonly sha: string | null
  readonly file: FileChange | null
}

export interface IHistoryState {
  readonly selection: IHistorySelection

  /** The ordered SHAs. */
  readonly history: ReadonlyArray<string>

  readonly changedFiles: ReadonlyArray<FileChange>

  readonly diff: IDiff | null
}

export interface IChangesState {
  readonly workingDirectory: WorkingDirectoryStatus
  readonly selectedFile: WorkingDirectoryFileChange | null
  readonly diff: IDiff | null

  /**
   * The commit message to use based on the contex of the repository, e.g., the
   * message from a recently undone commit.
   */
  readonly contextualCommitMessage: ICommitMessage | null

  /** The commit message for a work-in-progress commit in the changes view. */
  readonly commitMessage: ICommitMessage | null
}
