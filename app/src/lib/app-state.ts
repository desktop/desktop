import { Account } from '../models/account'
import { CommitIdentity } from '../models/commit-identity'
import { IDiff } from '../models/diff'
import { Repository, ILocalRepositoryState } from '../models/repository'

import { Branch, IAheadBehind } from '../models/branch'
import { Tip } from '../models/tip'
import { Commit } from '../models/commit'
import {
  CommittedFileChange,
  WorkingDirectoryStatus,
  WorkingDirectoryFileChange,
} from '../models/status'
import { CloningRepository } from '../models/cloning-repository'
import { IGitHubUser } from './databases/github-user-database'
import { SignInState } from './stores/sign-in-store'
import { ICommitMessage } from './stores/git-store'
import { IMenu } from '../models/app-menu'
import { IRemote } from '../models/remote'
import { WindowState } from './window-state'
import { RetryAction } from './retry-actions'
import { ExternalEditor } from '../lib/editors'
import { PreferencesTab } from '../models/preferences'
import { Shell } from './shells'
import { CloneRepositoryTab } from '../models/clone-repository-tab'
import { BranchesTab } from '../models/branches-tab'
import { PullRequest } from '../models/pull-request'
import { ReleaseSummary } from '../models/release-notes'
import { IAuthor } from '../models/author'
import { ComparisonCache } from './comparison-cache'
import { ApplicationTheme } from '../ui/lib/application-theme'
import { MergeResultKind } from '../models/merge'

export { ICommitMessage }

export enum SelectionType {
  Repository,
  CloningRepository,
  MissingRepository,
}

/** The image diff type. */
export enum ImageDiffType {
  /** Show the old and new images side by side. */
  TwoUp,

  /** Swipe between the old and new image. */
  Swipe,

  /** Onion skin. */
  OnionSkin,

  /** Highlight differences. */
  Difference,
}

export type PossibleSelections =
  | {
      type: SelectionType.Repository
      repository: Repository
      state: IRepositoryState
    }
  | {
      type: SelectionType.CloningRepository
      repository: CloningRepository
      progress: ICloneProgress
    }
  | { type: SelectionType.MissingRepository; repository: Repository }

/** All of the shared app state. */
export interface IAppState {
  readonly accounts: ReadonlyArray<Account>
  /**
   * The current list of repositories tracked in the application
   */
  readonly repositories: ReadonlyArray<Repository | CloningRepository>

  /**
   * A cache of the latest repository state values, keyed by the repository id
   */
  readonly localRepositoryStateLookup: Map<number, ILocalRepositoryState>

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
   * The current state of the window, ie maximized, minimized full-screen etc.
   */
  readonly windowState: WindowState

  /**
   * The current zoom factor of the window represented as a fractional number
   * where 1 equals 100% (ie actual size) and 2 represents 200%.
   */
  readonly windowZoomFactor: number

  /**
   * A value indicating whether or not the current application
   * window has focus.
   */
  readonly appIsFocused: boolean

  readonly showWelcomeFlow: boolean
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

  /** Whether we should show a confirmation dialog */
  readonly askForConfirmationOnRepositoryRemoval: boolean

  /** Whether we should show a confirmation dialog */
  readonly askForConfirmationOnDiscardChanges: boolean

  /** The external editor to use when opening repositories */
  readonly selectedExternalEditor?: ExternalEditor

  /** What type of visual diff mode we should use to compare images */
  readonly imageDiffType: ImageDiffType

  /** The user's preferred shell. */
  readonly selectedShell: Shell

  /** The current repository filter text. */
  readonly repositoryFilterText: string

  /** The currently selected tab for Clone Repository. */
  readonly selectedCloneRepositoryTab: CloneRepositoryTab

  /** The currently selected tab for the Branches foldout. */
  readonly selectedBranchesTab: BranchesTab

  /** The currently selected appearance (aka theme) */
  readonly selectedTheme: ApplicationTheme
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
  RemoveRepository,
  TermsAndConditions,
  PushBranchCommits,
  CLIInstalled,
  GenericGitAuthentication,
  ExternalEditorFailed,
  OpenShellFailed,
  InitializeLFS,
  LFSAttributeMismatch,
  UpstreamAlreadyExists,
  ReleaseNotes,
  DeletePullRequest,
  MergeConflicts,
}

export type Popup =
  | { type: PopupType.RenameBranch; repository: Repository; branch: Branch }
  | {
      type: PopupType.DeleteBranch
      repository: Repository
      branch: Branch
      existsOnRemote: boolean
    }
  | {
      type: PopupType.ConfirmDiscardChanges
      repository: Repository
      files: ReadonlyArray<WorkingDirectoryFileChange>
      showDiscardChangesSetting?: boolean
      discardingAllChanges?: boolean
    }
  | { type: PopupType.Preferences; initialSelectedTab?: PreferencesTab }
  | {
      type: PopupType.MergeBranch
      repository: Repository
      branch?: Branch
    }
  | { type: PopupType.RepositorySettings; repository: Repository }
  | { type: PopupType.AddRepository; path?: string }
  | { type: PopupType.CreateRepository; path?: string }
  | {
      type: PopupType.CloneRepository
      initialURL: string | null
    }
  | {
      type: PopupType.CreateBranch
      repository: Repository
      initialName?: string
    }
  | { type: PopupType.SignIn }
  | { type: PopupType.About }
  | { type: PopupType.InstallGit; path: string }
  | { type: PopupType.PublishRepository; repository: Repository }
  | { type: PopupType.Acknowledgements }
  | {
      type: PopupType.UntrustedCertificate
      certificate: Electron.Certificate
      url: string
    }
  | { type: PopupType.RemoveRepository; repository: Repository }
  | { type: PopupType.TermsAndConditions }
  | {
      type: PopupType.PushBranchCommits
      repository: Repository
      branch: Branch
      unPushedCommits?: number
    }
  | { type: PopupType.CLIInstalled }
  | {
      type: PopupType.GenericGitAuthentication
      hostname: string
      retryAction: RetryAction
    }
  | {
      type: PopupType.ExternalEditorFailed
      message: string
      suggestAtom?: boolean
      openPreferences?: boolean
    }
  | { type: PopupType.OpenShellFailed; message: string }
  | { type: PopupType.InitializeLFS; repositories: ReadonlyArray<Repository> }
  | { type: PopupType.LFSAttributeMismatch }
  | {
      type: PopupType.UpstreamAlreadyExists
      repository: Repository
      existingRemote: IRemote
    }
  | {
      type: PopupType.ReleaseNotes
      newRelease: ReleaseSummary
    }
  | {
      type: PopupType.DeletePullRequest
      repository: Repository
      branch: Branch
      pullRequest: PullRequest
    }
  | { type: PopupType.MergeConflicts; repository: Repository }

export enum FoldoutType {
  Repository,
  Branch,
  AppMenu,
  AddMenu,
}

export type AppMenuFoldout = {
  type: FoldoutType.AppMenu

  /**
   * Whether or not the application menu was opened with the Alt key, this
   * enables access key highlighting for applicable menu items as well as
   * keyboard navigation by pressing access keys.
   */
  enableAccessKeyNavigation: boolean

  /**
   * Whether the menu was opened by pressing Alt (or Alt+X where X is an
   * access key for one of the top level menu items). This is used as a
   * one-time signal to the AppMenu to use some special semantics for
   * selection and focus. Specifically it will ensure that the last opened
   * menu will receive focus.
   */
  openedWithAccessKey?: boolean
}

export type Foldout =
  | { type: FoldoutType.Repository }
  | { type: FoldoutType.Branch }
  | { type: FoldoutType.AddMenu }
  | AppMenuFoldout

export enum RepositorySectionTab {
  Changes,
  History,
}

/**
 * Stores information about a merge conflict when it occurs
 */
interface IConflictState {
  readonly branch: Branch
}

export interface IRepositoryState {
  readonly commitSelection: ICommitSelection
  readonly changesState: IChangesState
  readonly compareState: ICompareState
  readonly selectedSection: RepositorySectionTab

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
  readonly commitLookup: Map<string, Commit>

  /**
   * The ordered local commit SHAs. The commits themselves can be looked up in
   * `commitLookup.`
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

  /**
   * If we're currently reverting a commit and it involves LFS progress, this
   * will contain the LFS progress.
   *
   * null if no such operation is in flight.
   */
  readonly revertProgress: IRevertProgress | null
}

export type Progress =
  | IGenericProgress
  | ICheckoutProgress
  | IFetchProgress
  | IPullProgress
  | IPushProgress
  | IRevertProgress

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
  readonly remote: string
}

/**
 * An object describing the progression of a pull operation
 */
export interface IPullProgress extends IProgress {
  kind: 'pull'

  /**
   * The remote that's being pulled from
   */
  readonly remote: string
}

/**
 * An object describing the progression of a pull operation
 */
export interface IPushProgress extends IProgress {
  kind: 'push'

  /**
   * The remote that's being pushed to
   */
  readonly remote: string

  /**
   * The branch that's being pushed
   */
  readonly branch: string
}

/**
 * An object describing the progression of a fetch operation
 */
export interface ICloneProgress extends IProgress {
  kind: 'clone'
}

/** An object describing the progression of a revert operation. */
export interface IRevertProgress extends IProgress {
  kind: 'revert'
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

  /** The open pull requests in the repository. */
  readonly openPullRequests: ReadonlyArray<PullRequest>

  /** Are we currently loading pull requests? */
  readonly isLoadingPullRequests: boolean

  /** The pull request associated with the current branch. */
  readonly currentPullRequest: PullRequest | null
}

export interface ICommitSelection {
  /** The commit currently selected in the app */
  readonly sha: string | null

  /** The list of files associated with the current commit */
  readonly changedFiles: ReadonlyArray<CommittedFileChange>

  /** The selected file inside the selected commit */
  readonly file: CommittedFileChange | null

  /** The diff of the currently-selected file */
  readonly diff: IDiff | null
}

export interface IChangesState {
  readonly workingDirectory: WorkingDirectoryStatus

  /**
   * The ID of the selected files. The files themselves can be looked up in
   * `workingDirectory`.
   */
  readonly selectedFileIDs: string[]

  readonly diff: IDiff | null

  /**
   * The commit message to use based on the context of the repository, e.g., the
   * message from a recently undone commit.
   */
  readonly contextualCommitMessage: ICommitMessage | null

  /** The commit message for a work-in-progress commit in the changes view. */
  readonly commitMessage: ICommitMessage | null

  /**
   * Whether or not to show a field for adding co-authors to
   * a commit (currently only supported for GH/GHE repositories)
   */
  readonly showCoAuthoredBy: boolean

  /**
   * A list of authors (name, email pairs) which have been
   * entered into the co-authors input box in the commit form
   * and which _may_ be used in the subsequent commit to add
   * Co-Authored-By commit message trailers depending on whether
   * the user has chosen to do so.
   */
  readonly coAuthors: ReadonlyArray<IAuthor>

  /**
   * Stores information about a merge conflict when it occurs
   *
   * The absence of a value means there is no merge conflict
   */
  readonly conflictState: IConflictState | null
}

export enum ComparisonView {
  None = 'none',
  Ahead = 'ahead',
  Behind = 'behind',
}

/**
 * The default comparison state is to display the history for the current
 * branch.
 */
export interface IDisplayHistory {
  readonly kind: ComparisonView.None
}

/**
 * When the user has chosen another branch to compare, using their current
 * branch as the base branch.
 */
export interface ICompareBranch {
  /** The chosen comparison mode determines which commits to show */
  readonly kind: ComparisonView.Ahead | ComparisonView.Behind

  /** The branch to compare against the base branch */
  readonly comparisonBranch: Branch

  /** The number of commits the selected branch is ahead/behind the current branch */
  readonly aheadBehind: IAheadBehind
}

export interface ICompareState {
  /** Show the diverging notification banner */
  readonly isDivergingBranchBannerVisible: boolean

  /** The current state of the compare form, based on user input */
  readonly formState: IDisplayHistory | ICompareBranch

  /** The result of merging the compare branch into the current branch, if a branch selected */
  readonly mergeStatus: MergeResultStatus | null

  /** Whether the branch list should be expanded or hidden */
  readonly showBranchList: boolean

  /** The text entered into the compare branch filter text box */
  readonly filterText: string

  /** The SHA associated with the most recent history state */
  readonly tip: string | null

  /** The SHAs of commits to render in the compare list */
  readonly commitSHAs: ReadonlyArray<string>

  /** A list of all branches (remote and local) currently in the repository. */
  readonly allBranches: ReadonlyArray<Branch>

  /**
   * A list of zero to a few (at time of writing 5 but check loadRecentBranches
   * in git-store for definitive answer) branches that have been checked out
   * recently. This list is compiled by reading the reflog and tracking branch
   * switches over the last couple of thousand reflog entries.
   */
  readonly recentBranches: ReadonlyArray<Branch>

  /**
   * The default branch for a given repository. Most commonly this
   * will be the 'master' branch but GitHub users are able to change
   * their default branch in the web UI.
   */
  readonly defaultBranch: Branch | null

  /**
   * A local cache of ahead/behind computations to compare other refs to the current branch
   */
  readonly aheadBehindCache: ComparisonCache

  /**
   * The best candidate branch to compare the current branch to.
   * Also includes the ahead/behind info for the inferred branch
   * relative to the current branch.
   */
  readonly inferredComparisonBranch: {
    branch: Branch | null
    aheadBehind: IAheadBehind | null
  }
}

export interface ICompareFormUpdate {
  /** The updated filter text to set */
  readonly filterText: string

  /** Thew new state of the branches list */
  readonly showBranchList: boolean
}

export type MergeResultStatus =
  | {
      kind: MergeResultKind.Loading
    }
  | {
      kind: MergeResultKind.Conflicts
      conflictedFiles: number
    }
  | { kind: MergeResultKind.Clean }
  | { kind: MergeResultKind.Invalid }

export enum CompareActionKind {
  History = 'History',
  Branch = 'Branch',
}

export interface ICompareToBranch {
  readonly kind: CompareActionKind.Branch
  readonly branch: Branch
  readonly mode: ComparisonView.Ahead | ComparisonView.Behind
}

/**
 * An action to send to the application store to update the compare state
 */
export type CompareAction =
  | {
      readonly kind: CompareActionKind.History
    }
  | ICompareToBranch
