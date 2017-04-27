import { Account } from '../models/account'
import { CommitIdentity } from '../models/commit-identity'
import { IDiff } from '../models/diff'
import { Repository } from '../models/repository'
import { IAheadBehind } from './git'
import { Branch } from '../models/branch'
import { Tip } from '../models/tip'
import { Commit } from '../models/commit'
import { FileChange, WorkingDirectoryStatus, WorkingDirectoryFileChange } from '../models/status'
import { CloningRepository, IGitHubUser, SignInState } from './dispatcher'
import { ICommitMessage } from './dispatcher/git-store'
import { IMenu } from '../models/app-menu'
import { IRemote } from '../models/remote'
import { WindowState } from './window-state'

export { ICommitMessage }
export { IAheadBehind }

export enum SelectionType {
  Repository,
  CloningRepository,
  MissingRepository,
}

export type PossibleSelections = { type: SelectionType.Repository, repository: Repository, state: IRepositoryState } |
                                 { type: SelectionType.CloningRepository, repository: CloningRepository, progress: ICloneProgress } |
                                 { type: SelectionType.MissingRepository, repository: Repository }

/** All of the shared app state. */
export interface IAppState {
  readonly accounts: ReadonlyArray<Account>
  readonly repositories: ReadonlyArray<Repository | CloningRepository>

  readonly selectedState: PossibleSelections | null

  /**
   * The state of the ongoing (if any) sign in process. See SignInState
   * and SignInStore for more details. Null if no current sign in flow
   * is active. Sign in flows are initiated through the dispatcher methods
   * beginDotComSignIn and beginEnterpriseSign in or via the
   * showDotcomSignInDialog and showEnterpriseSignInDialog methods.
   */
  readonly signInState: SignInState | null

  /**
   * The current state of the Window, ie maximized, minimized full-screen etc.
   */
  readonly windowState: WindowState
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

  readonly errors: ReadonlyArray<Error>

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
   * Used to highlight access keys throughout the app when the
   * Alt key is pressed. Only applicable on non-macOS platforms.
   */
  readonly highlightAccessKeys: boolean

  /** Whether we should show the update banner */
  readonly isUpdateAvailableBannerVisible: boolean
}

export enum PopupType {
  RenameBranch = 1,
  DeleteBranch,
  ConfirmDiscardChanges,
  Preferences,
  MergeBranch,
  RepositorySettings,
  AddRepository,
  CreateRepository,
  CloneRepository,
  CreateBranch,
  SignIn,
  About,
  InstallGit,
  PublishRepository,
  Acknowledgements,
  UntrustedCertificate,
}

export type Popup = { type: PopupType.RenameBranch, repository: Repository, branch: Branch } |
                    { type: PopupType.DeleteBranch, repository: Repository, branch: Branch } |
                    { type: PopupType.ConfirmDiscardChanges, repository: Repository, files: ReadonlyArray<WorkingDirectoryFileChange> } |
                    { type: PopupType.Preferences } |
                    { type: PopupType.MergeBranch, repository: Repository } |
                    { type: PopupType.RepositorySettings, repository: Repository } |
                    { type: PopupType.AddRepository } |
                    { type: PopupType.CreateRepository } |
                    { type: PopupType.CloneRepository } |
                    { type: PopupType.CreateBranch, repository: Repository } |
                    { type: PopupType.SignIn } |
                    { type: PopupType.About } |
                    { type: PopupType.InstallGit, path: string } |
                    { type: PopupType.PublishRepository, repository: Repository } |
                    { type: PopupType.Acknowledgements } |
                    { type: PopupType.UntrustedCertificate, certificate: Electron.Certificate, url: string }

export enum FoldoutType {
  Repository,
  Branch,
  AppMenu,
  AddMenu,
}

export type AppMenuFoldout = {
  type: FoldoutType.AppMenu,

  /**
   * Whether or not the application menu was opened with the Alt key, this
   * enables access key highlighting for applicable menu items as well as
   * keyboard navigation by pressing access keys.
   */
  enableAccessKeyNavigation: boolean,

  /**
   * Whether the menu was opened by pressing Alt (or Alt+X where X is an
   * access key for one of the top level menu items). This is used as a
   * one-time signal to the AppMenu to use some special semantics for
   * selection and focus. Specifically it will ensure that the last opened
   * menu will receive focus.
   */
  openedWithAccessKey?: boolean,
}

export type Foldout =
  { type: FoldoutType.Repository } |
  { type: FoldoutType.Branch } |
  { type: FoldoutType.AddMenu } |
  AppMenuFoldout

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
  readonly isPushPullFetchInProgress: boolean

  /** Is a commit in progress? */
  readonly isCommitting: boolean

  /** The date the repository was last fetched. */
  readonly lastFetched: Date | null

  /**
   * If we're currently working on switching to a new branch this
   * provides insight into the progress of that operation.
   *
   * null if no current branch switch operation is in flight.
   */
  readonly checkoutProgress: ICheckoutProgress | null

  /**
   * If we're currently working on pushing a branch, fetching
   * from a remote or pulling a branch this provides insight
   * into the progress of that operation.
   *
   * null if no such operation is in flight.
   */
  readonly pushPullFetchProgress: Progress | null
}

export type Progress = IGenericProgress
  | ICheckoutProgress
  | IFetchProgress
  | IPullProgress
  | IPushProgress

/**
 * Base interface containing all the properties that progress events
 * need to support.
 */
interface IProgress {

  /**
   * The overall progress of the operation, represented as a fraction between
   * 0 and 1.
   */
  readonly value: number

  /**
   * An informative text for user consumption indicating the current operation
   * state. This will be high level such as 'Pushing origin' or
   * 'Fetching upstream' and will typically persist over a number of progress
   * events. For more detailed information about the progress see
   * the description field
   */
  readonly title: string

  /**
   * An informative text for user consumption. In the case of git progress this
   * will usually be the last raw line of output from git.
   */
  readonly description?: string
}

/**
 * An object describing progression of an operation that can't be
 * directly mapped or attributed to either one of the more specific
 * progress events (Fetch, Checkout etc). An example of this would be
 * our own refreshing of internal repository state that takes part
 * after fetch, push and pull.
 */
export interface IGenericProgress extends IProgress {
  kind: 'generic'
}

/**
 * An object describing the progression of a branch checkout operation
 */
export interface ICheckoutProgress extends IProgress {
  kind: 'checkout'

  /** The branch that's currently being checked out */
  readonly targetBranch: string
}

/**
 * An object describing the progression of a fetch operation
 */
export interface IFetchProgress extends IProgress {
  kind: 'fetch'

  /**
   * The remote that's being fetched
   */
  readonly remote: string,
}

/**
 * An object describing the progression of a pull operation
 */
export interface IPullProgress extends IProgress {
  kind: 'pull'

  /**
   * The remote that's being pulled from
   */
  readonly remote: string,
}

/**
 * An object describing the progression of a pull operation
 */
export interface IPushProgress extends IProgress {
  kind: 'push'

  /**
   * The remote that's being pushed to
   */
  readonly remote: string,

  /**
   * The branch that's being pushed
   */
  readonly branch: string,
}

/**
 * An object describing the progression of a fetch operation
 */
export interface ICloneProgress extends IProgress {
  kind: 'clone'
}

export interface IBranchesState {
  /**
   * The current tip of HEAD, either a branch, a commit (if HEAD is
   * detached) or an unborn branch (a branch with no commits).
   */
  readonly tip: Tip

  /**
   * The default branch for a given repository. Most commonly this
   * will be the 'master' branch but GitHub users are able to change
   * their default branch in the web UI.
   */
  readonly defaultBranch: Branch | null

  /**
   * A list of all branches (remote and local) that's currently in
   * the repository.
   */
  readonly allBranches: ReadonlyArray<Branch>

  /**
   * A list of zero to a few (at time of writing 5 but check loadRecentBranches
   * in git-store for definitive answer) branches that have been checked out
   * recently. This list is compiled by reading the reflog and tracking branch
   * switches over the last couple of thousand reflog entries.
   */
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

  /**
   * The ID of the selected file. The file itself can be looked up in
   * `workingDirectory`.
   */
  readonly selectedFileID: string | null

  readonly diff: IDiff | null

  /**
   * The commit message to use based on the contex of the repository, e.g., the
   * message from a recently undone commit.
   */
  readonly contextualCommitMessage: ICommitMessage | null

  /** The commit message for a work-in-progress commit in the changes view. */
  readonly commitMessage: ICommitMessage | null
}
