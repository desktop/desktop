import { Account } from '../models/account'
import { CommitIdentity } from '../models/commit-identity'
import { IDiff, ImageDiffType } from '../models/diff'
import { Repository, ILocalRepositoryState } from '../models/repository'
import { Branch, IAheadBehind } from '../models/branch'
import { Tip } from '../models/tip'
import { Commit, CommitOneLine } from '../models/commit'
import { CommittedFileChange, WorkingDirectoryStatus } from '../models/status'
import { CloningRepository } from '../models/cloning-repository'
import { IMenu } from '../models/app-menu'
import { IRemote } from '../models/remote'
import { CloneRepositoryTab } from '../models/clone-repository-tab'
import { BranchesTab } from '../models/branches-tab'
import { PullRequest } from '../models/pull-request'
import { IAuthor } from '../models/author'
import { MergeTreeResult } from '../models/merge'
import { ICommitMessage } from '../models/commit-message'
import {
  IRevertProgress,
  Progress,
  ICheckoutProgress,
  ICloneProgress,
  ICherryPickProgress,
} from '../models/progress'
import { Popup } from '../models/popup'

import { SignInState } from './stores/sign-in-store'

import { WindowState } from './window-state'
import { Shell } from './shells'

import { ApplicableTheme, ApplicationTheme } from '../ui/lib/application-theme'
import { IAccountRepositories } from './stores/api-repositories-store'
import { ManualConflictResolution } from '../models/manual-conflict-resolution'
import { Banner } from '../models/banner'
import { GitRebaseProgress } from '../models/rebase'
import { RebaseFlowStep } from '../models/rebase-flow-step'
import { IStashEntry } from '../models/stash-entry'
import { TutorialStep } from '../models/tutorial-step'
import { UncommittedChangesStrategy } from '../models/uncommitted-changes-strategy'
import { CherryPickFlowStep } from '../models/cherry-pick'
import { DragElement } from '../models/drag-element'

export enum SelectionType {
  Repository,
  CloningRepository,
  MissingRepository,
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
   * List of IDs of the most recently opened repositories (most recent first)
   */
  readonly recentRepositories: ReadonlyArray<number>

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
  readonly focusCommitMessage: boolean
  readonly currentPopup: Popup | null
  readonly currentFoldout: Foldout | null
  readonly currentBanner: Banner | null

  /**
   * The shape of the drag element rendered in the `app.renderDragElement`. It
   * is used in conjunction with the `Draggable` component.
   */
  readonly currentDragElement: DragElement | null

  /**
   * A list of currently open menus with their selected items
   * in the application menu.
   *
   * The semantics around what constitutes an open menu and how
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

  /** The width of the files list in the stash view */
  readonly stashedFilesWidth: number

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

  /** Should the app prompt the user to confirm a force push? */
  readonly askForConfirmationOnForcePush: boolean

  /** How the app should handle uncommitted changes when switching branches */
  readonly uncommittedChangesStrategy: UncommittedChangesStrategy

  /** The external editor to use when opening repositories */
  readonly selectedExternalEditor: string | null

  /** The current setting for whether the user has disable usage reports */
  readonly optOutOfUsageTracking: boolean
  /**
   * A cached entry representing an external editor found on the user's machine:
   *
   *  - If the `selectedExternalEditor` can be found, choose that
   *  - Otherwise, if any editors found, this will be set to the first value
   *    based on the search order in `app/src/lib/editors/{platform}.ts`
   *  - If no editors found, this will remain `null`
   */
  readonly resolvedExternalEditor: string | null

  /** What type of visual diff mode we should use to compare images */
  readonly imageDiffType: ImageDiffType

  /** Whether we should hide white space changes in diff */
  readonly hideWhitespaceInDiff: boolean

  /** Whether we should show side by side diffs */
  readonly showSideBySideDiff: boolean

  /** The user's preferred shell. */
  readonly selectedShell: Shell

  /** The current repository filter text. */
  readonly repositoryFilterText: string

  /** The currently selected tab for Clone Repository. */
  readonly selectedCloneRepositoryTab: CloneRepositoryTab

  /** The currently selected tab for the Branches foldout. */
  readonly selectedBranchesTab: BranchesTab

  /** The selected appearance (aka theme) preference */
  readonly selectedTheme: ApplicationTheme

  /** The currently applied appearance (aka theme) */
  readonly currentTheme: ApplicableTheme

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

  /** Which step the user is on in the Onboarding Tutorial */
  readonly currentOnboardingTutorialStep: TutorialStep

  /**
   * Whether or not the app should update the repository indicators (the
   * blue dot and the ahead/behind arrows in the repository list used to
   * indicate that the repository has uncommitted changes or is out of sync
   * with its remote) in the background. See `RepositoryIndicatorUpdater`
   * for more information
   */
  readonly repositoryIndicatorsEnabled: boolean

  /**
   * Whether or not the app should use spell check on commit summary and description
   */
  readonly commitSpellcheckEnabled: boolean

  /**
   * Whether or not the user has been introduced to the cherry pick feature
   */
  readonly hasShownCherryPickIntro: boolean
}

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

export type BranchFoldout = {
  type: FoldoutType.Branch
}

export type Foldout =
  | { type: FoldoutType.Repository }
  | { type: FoldoutType.AddMenu }
  | BranchFoldout
  | AppMenuFoldout

export enum RepositorySectionTab {
  Changes,
  History,
}

/**
 * Stores information about a merge conflict when it occurs
 */
export type MergeConflictState = {
  readonly kind: 'merge'
  readonly currentBranch: string
  readonly currentTip: string
  readonly manualResolutions: Map<string, ManualConflictResolution>
}

/** Guard function for checking conflicts are from a merge  */
export function isMergeConflictState(
  conflictStatus: ConflictState
): conflictStatus is MergeConflictState {
  return conflictStatus.kind === 'merge'
}

/**
 * Stores information about a rebase conflict when it occurs
 */
export type RebaseConflictState = {
  readonly kind: 'rebase'
  /**
   * This is the commit ID of the HEAD of the in-flight rebase
   */
  readonly currentTip: string
  /**
   * The branch chosen by the user to be rebased
   */
  readonly targetBranch: string
  /**
   * The branch chosen as the baseline for the rebase
   */
  readonly baseBranch?: string

  /**
   * The commit ID of the target branch before the rebase was initiated
   */
  readonly originalBranchTip: string
  /**
   * The commit ID of the base branch onto which the history will be applied
   */
  readonly baseBranchTip: string
  /**
   * Manual resolutions chosen by the user for conflicted files to be applied
   * before continuing the rebase.
   */
  readonly manualResolutions: Map<string, ManualConflictResolution>
}

/** Guard function for checking conflicts are from a rebase  */
export function isRebaseConflictState(
  conflictStatus: ConflictState
): conflictStatus is RebaseConflictState {
  return conflictStatus.kind === 'rebase'
}

/**
 * Conflicts can occur during a rebase, merge, or cherry pick.
 *
 * Callers should inspect the `kind` field to determine the kind of conflict
 * that is occurring, as this will then provide additional information specific
 * to the conflict, to help with resolving the issue.
 */
export type ConflictState =
  | MergeConflictState
  | RebaseConflictState
  | CherryPickConflictState

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

  readonly rebaseState: IRebaseState

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

  /** The tags that will get pushed if the user performs a push operation. */
  readonly tagsToPush: ReadonlyArray<string> | null

  /** Is a push/pull/fetch in progress? */
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

  readonly localTags: Map<string, string> | null

  /** State associated with a cherry pick being performed */
  readonly cherryPickState: ICherryPickState
}

export interface IBranchesState {
  /**
   * The current tip of HEAD, either a branch, a commit (if HEAD is
   * detached) or an unborn branch (a branch with no commits).
   */
  readonly tip: Tip

  /**
   * The default branch for a given repository. Historically it's been
   * common to use 'master' as the default branch but as of September 2020
   * GitHub Desktop and GitHub.com default to using 'main' as the default branch.
   *
   * GitHub Desktop users are able to configure the `init.defaultBranch` Git
   * setting in preferences.
   *
   * GitHub.com users are able to change their default branch in the web UI.
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

  /**
   * Is the current branch configured to rebase on pull?
   *
   * This is the value returned from git config (local or global) for `git config pull.rebase`
   *
   * If this value is not found in config, this will be `undefined` to indicate
   * that the default Git behaviour will occur.
   */
  readonly pullWithRebase?: boolean

  /** Tracking branches that have been rebased within Desktop */
  readonly rebasedBranches: ReadonlyMap<string, string>
}

/** State associated with a rebase being performed on a repository */
export interface IRebaseState {
  /**
   * The current step of the flow the user should see.
   *
   * `null` indicates that there is no rebase underway.
   */
  readonly step: RebaseFlowStep | null

  /**
   * The underlying Git information associated with the current rebase
   *
   * This will be set to `null` when no base branch has been selected to
   * initiate the rebase.
   */
  readonly progress: GitRebaseProgress | null

  /**
   * The known range of commits that will be applied to the repository
   *
   * This will be set to `null` when no base branch has been selected to
   * initiate the rebase.
   */
  readonly commits: ReadonlyArray<CommitOneLine> | null

  /**
   * Whether the user has done work to resolve any conflicts as part of this
   * rebase, as the rebase flow should confirm the user wishes to abort the
   * rebase and lose that work.
   */
  readonly userHasResolvedConflicts: boolean
}

export interface ICommitSelection {
  /** The commits currently selected in the app */
  readonly shas: ReadonlyArray<string>

  /** The list of files associated with the current commit */
  readonly changedFiles: ReadonlyArray<CommittedFileChange>

  /** The selected file inside the selected commit */
  readonly file: CommittedFileChange | null

  /** The diff of the currently-selected file */
  readonly diff: IDiff | null
}

export enum ChangesSelectionKind {
  WorkingDirectory = 'WorkingDirectory',
  Stash = 'Stash',
}

export type ChangesWorkingDirectorySelection = {
  readonly kind: ChangesSelectionKind.WorkingDirectory

  /**
   * The ID of the selected files. The files themselves can be looked up in
   * the `workingDirectory` property in `IChangesState`.
   */
  readonly selectedFileIDs: ReadonlyArray<string>
  readonly diff: IDiff | null
}

export type ChangesStashSelection = {
  readonly kind: ChangesSelectionKind.Stash

  /** Currently selected file in the stash diff viewer UI (aka the file we want to show the diff for) */
  readonly selectedStashedFile: CommittedFileChange | null

  /** Currently selected file's diff */
  readonly selectedStashedFileDiff: IDiff | null
}

export type ChangesSelection =
  | ChangesWorkingDirectorySelection
  | ChangesStashSelection

export interface IChangesState {
  readonly workingDirectory: WorkingDirectoryStatus

  /** The commit message for a work-in-progress commit in the changes view. */
  readonly commitMessage: ICommitMessage

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
   * Stores information about conflicts in the working directory
   *
   * The absence of a value means there is no merge or rebase conflict underway
   */
  readonly conflictState: ConflictState | null

  /**
   * The latest GitHub Desktop stash entry for the current branch, or `null`
   * if no stash exists for the current branch.
   */
  readonly stashEntry: IStashEntry | null

  /**
   * The current selection state in the Changes view. Can be either
   * working directory or a stash. In the case of a working directory
   * selection multiple files may be selected. See `ChangesSelection`
   * for more information about the differences between the two.
   */
  readonly selection: ChangesSelection

  /** `true` if the GitHub API reports that the branch is protected */
  readonly currentBranchProtected: boolean
}

/**
 * This represents the various states the History tab can be in.
 *
 * By default, it should show the history of the current branch.
 */
export enum HistoryTabMode {
  History = 'History',
  Compare = 'Compare',
}

/**
 * This represents whether the compare tab is currently viewing the
 * commits ahead or behind when merging some other branch into your
 * current branch.
 */
export enum ComparisonMode {
  Ahead = 'Ahead',
  Behind = 'Behind',
}

/**
 * The default comparison state is to display the history for the current
 * branch.
 */
export interface IDisplayHistory {
  readonly kind: HistoryTabMode.History
}

/**
 * When the user has chosen another branch to compare, using their current
 * branch as the base branch.
 */
export interface ICompareBranch {
  readonly kind: HistoryTabMode.Compare

  /** The chosen comparison mode determines which commits to show */
  readonly comparisonMode: ComparisonMode.Ahead | ComparisonMode.Behind

  /** The branch to compare against the base branch */
  readonly comparisonBranch: Branch

  /** The number of commits the selected branch is ahead/behind the current branch */
  readonly aheadBehind: IAheadBehind
}

export interface ICompareState {
  /** The current state of the compare form, based on user input */
  readonly formState: IDisplayHistory | ICompareBranch

  /** The result of merging the compare branch into the current branch, if a branch selected */
  readonly mergeStatus: MergeTreeResult | null

  /** Whether the branch list should be expanded or hidden */
  readonly showBranchList: boolean

  /** The text entered into the compare branch filter text box */
  readonly filterText: string

  /** The SHA associated with the most recent history state */
  readonly tip: string | null

  /** The SHAs of commits to render in the compare list */
  readonly commitSHAs: ReadonlyArray<string>

  /**
   * A list of branches (remote and local) except the current branch, and
   * Desktop fork remote branches (see `Branch.isDesktopForkRemoteBranch`)
   **/
  readonly branches: ReadonlyArray<Branch>

  /**
   * A list of zero to a few (at time of writing 5 but check loadRecentBranches
   * in git-store for definitive answer) branches that have been checked out
   * recently. This list is compiled by reading the reflog and tracking branch
   * switches over the last couple of thousand reflog entries.
   */
  readonly recentBranches: ReadonlyArray<Branch>

  /**
   * The default branch for a given repository. Historically it's been
   * common to use 'master' as the default branch but as of September 2020
   * GitHub Desktop and GitHub.com default to using 'main' as the default branch.
   *
   * GitHub Desktop users are able to configure the `init.defaultBranch` Git
   * setting in preferences.
   *
   * GitHub.com users are able to change their default branch in the web UI.
   */
  readonly defaultBranch: Branch | null
}

export interface ICompareFormUpdate {
  /** The updated filter text to set */
  readonly filterText: string

  /** Thew new state of the branches list */
  readonly showBranchList: boolean
}

export interface IViewHistory {
  readonly kind: HistoryTabMode.History
}

export interface ICompareToBranch {
  readonly kind: HistoryTabMode.Compare
  readonly branch: Branch
  readonly comparisonMode: ComparisonMode.Ahead | ComparisonMode.Behind
}

/**
 * An action to send to the application store to update the compare state
 */
export type CompareAction = IViewHistory | ICompareToBranch

/** State associated with a cherry pick being performed on a repository */
export interface ICherryPickState {
  /**
   * The current step of the flow the user should see.
   *
   * `null` indicates that there is no cherry pick underway.
   */
  readonly step: CherryPickFlowStep | null

  /**
   * The underlying Git information associated with the current cherry pick
   *
   * This will be set to `null` when no target branch has been selected to
   * initiate the rebase.
   */
  readonly progress: ICherryPickProgress | null

  /**
   * Whether the user has done work to resolve any conflicts as part of this
   * cherry pick.
   */
  readonly userHasResolvedConflicts: boolean

  /**
   * The sha of the target branch tip before cherry pick initiated.
   *
   * This will be set to null if no cherry pick has been initiated.
   */
  readonly targetBranchUndoSha: string | null

  /**
   * Whether the target branch was created during cherry-pick operation
   */
  readonly branchCreated: boolean
}

/**
 * Stores information about a cherry pick conflict when it occurs
 */
export type CherryPickConflictState = {
  readonly kind: 'cherryPick'

  /**
   * Manual resolutions chosen by the user for conflicted files to be applied
   * before continuing the cherry pick.
   */
  readonly manualResolutions: Map<string, ManualConflictResolution>

  /**
   * The branch chosen by the user to copy the cherry picked commits to
   */
  readonly targetBranchName: string
}

/** Guard function for checking conflicts are from a rebase  */
export function isCherryPickConflictState(
  conflictStatus: ConflictState
): conflictStatus is CherryPickConflictState {
  return conflictStatus.kind === 'cherryPick'
}
