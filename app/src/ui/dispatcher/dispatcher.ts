import { Disposable, DisposableLike } from 'event-kit'

import {
  IAPIOrganization,
  IAPIPullRequest,
  IAPIFullRepository,
  IAPICheckSuite,
  IAPIRepoRuleset,
  getDotComAPIEndpoint,
} from '../../lib/api'
import { shell } from '../../lib/app-shell'
import {
  CompareAction,
  Foldout,
  FoldoutType,
  ICompareFormUpdate,
  RepositorySectionTab,
  RebaseConflictState,
  isRebaseConflictState,
  isCherryPickConflictState,
  CherryPickConflictState,
  MultiCommitOperationConflictState,
  IMultiCommitOperationState,
} from '../../lib/app-state'
import { assertNever, fatalError } from '../../lib/fatal-error'
import {
  setGenericPassword,
  setGenericUsername,
} from '../../lib/generic-git-auth'
import {
  RebaseResult,
  PushOptions,
  getCommitsBetweenCommits,
  getBranches,
  getRebaseSnapshot,
  getRepositoryType,
} from '../../lib/git'
import { isGitOnPath } from '../../lib/is-git-on-path'
import {
  IOpenRepositoryFromURLAction,
  IUnknownAction,
  URLActionType,
} from '../../lib/parse-app-url'
import {
  matchExistingRepository,
  urlsMatch,
} from '../../lib/repository-matching'
import { Shell } from '../../lib/shells'
import { ILaunchStats, StatsStore } from '../../lib/stats'
import { AppStore } from '../../lib/stores/app-store'
import { RepositoryStateCache } from '../../lib/stores/repository-state-cache'
import { getTipSha } from '../../lib/tip'

import { Account } from '../../models/account'
import { AppMenu, ExecutableMenuItem } from '../../models/app-menu'
import { Author, UnknownAuthor } from '../../models/author'
import { Branch, IAheadBehind } from '../../models/branch'
import { BranchesTab } from '../../models/branches-tab'
import { CloneRepositoryTab } from '../../models/clone-repository-tab'
import { CloningRepository } from '../../models/cloning-repository'
import { Commit, ICommitContext, CommitOneLine } from '../../models/commit'
import { ICommitMessage } from '../../models/commit-message'
import { DiffSelection, ImageDiffType, ITextDiff } from '../../models/diff'
import { FetchType } from '../../models/fetch'
import { GitHubRepository } from '../../models/github-repository'
import { ManualConflictResolution } from '../../models/manual-conflict-resolution'
import { Popup, PopupType } from '../../models/popup'
import {
  PullRequest,
  PullRequestSuggestedNextAction,
} from '../../models/pull-request'
import {
  Repository,
  RepositoryWithGitHubRepository,
  isRepositoryWithGitHubRepository,
  getGitHubHtmlUrl,
  isRepositoryWithForkedGitHubRepository,
  getNonForkGitHubRepository,
} from '../../models/repository'
import { RetryAction, RetryActionType } from '../../models/retry-actions'
import {
  CommittedFileChange,
  WorkingDirectoryFileChange,
  WorkingDirectoryStatus,
} from '../../models/status'
import { TipState, IValidBranch } from '../../models/tip'
import { Banner, BannerType } from '../../models/banner'

import { ApplicationTheme } from '../lib/application-theme'
import { installCLI } from '../lib/install-cli'
import {
  executeMenuItem,
  moveToApplicationsFolder,
  isWindowFocused,
  showOpenDialog,
} from '../main-process-proxy'
import {
  CommitStatusStore,
  StatusCallBack,
} from '../../lib/stores/commit-status-store'
import { MergeTreeResult } from '../../models/merge'
import { UncommittedChangesStrategy } from '../../models/uncommitted-changes-strategy'
import { IStashEntry } from '../../models/stash-entry'
import { WorkflowPreferences } from '../../models/workflow-preferences'
import { resolveWithin } from '../../lib/path'
import { CherryPickResult } from '../../lib/git/cherry-pick'
import { sleep } from '../../lib/promise'
import { DragElement, DragType } from '../../models/drag-drop'
import { ILastThankYou } from '../../models/last-thank-you'
import { dragAndDropManager } from '../../lib/drag-and-drop-manager'
import {
  CreateBranchStep,
  MultiCommitOperationDetail,
  MultiCommitOperationKind,
  MultiCommitOperationStep,
  MultiCommitOperationStepKind,
} from '../../models/multi-commit-operation'
import { getMultiCommitOperationChooseBranchStep } from '../../lib/multi-commit-operation'
import { ICombinedRefCheck, IRefCheck } from '../../lib/ci-checks/ci-checks'
import { ValidNotificationPullRequestReviewState } from '../../lib/valid-notification-pull-request-review'
import { UnreachableCommitsTab } from '../history/unreachable-commits-dialog'
import { sendNonFatalException } from '../../lib/helpers/non-fatal-exception'
import { SignInResult } from '../../lib/stores/sign-in-store'
import { ICustomIntegration } from '../../lib/custom-integration'

/**
 * An error handler function.
 *
 * If the returned {Promise} returns an error, it will be passed to the next
 * error handler. If it returns null, error propagation is halted.
 */
export type ErrorHandler = (
  error: Error,
  dispatcher: Dispatcher
) => Promise<Error | null>

/**
 * The Dispatcher acts as the hub for state. The StateHub if you will. It
 * decouples the consumer of state from where/how it is stored.
 */
export class Dispatcher {
  private readonly errorHandlers = new Array<ErrorHandler>()
  public incrementMetric: StatsStore['increment']

  public constructor(
    private readonly appStore: AppStore,
    private readonly repositoryStateManager: RepositoryStateCache,
    private readonly statsStore: StatsStore,
    private readonly commitStatusStore: CommitStatusStore
  ) {
    this.incrementMetric = statsStore.increment.bind(statsStore)
  }

  /** Load the initial state for the app. */
  public loadInitialState(): Promise<void> {
    return this.appStore.loadInitialState()
  }

  /**
   * Add the repositories at the given paths. If a path isn't a repository, then
   * this will post an error to that affect.
   */
  public addRepositories(
    paths: ReadonlyArray<string>
  ): Promise<ReadonlyArray<Repository>> {
    return this.appStore._addRepositories(paths)
  }

  /**
   * Add a tutorial repository.
   *
   * This method differs from the `addRepositories` method in that it
   * requires that the repository has been created on the remote and
   * set up to track it. Given that tutorial repositories are created
   * from the no-repositories blank slate it shouldn't be possible for
   * another repository with the same path to exist but in case that
   * changes in the future this method will set the tutorial flag on
   * the existing repository at the given path.
   */
  public addTutorialRepository(
    path: string,
    endpoint: string,
    apiRepository: IAPIFullRepository
  ) {
    return this.appStore._addTutorialRepository(path, endpoint, apiRepository)
  }

  /** Resume an already started onboarding tutorial */
  public resumeTutorial(repository: Repository) {
    return this.appStore._resumeTutorial(repository)
  }

  /** Suspend the onboarding tutorial and go to the no repositories blank slate view */
  public pauseTutorial(repository: Repository) {
    return this.appStore._pauseTutorial(repository)
  }

  /**
   * Remove the repositories represented by the given IDs from local storage.
   *
   * When `moveToTrash` is enabled, only the repositories that were successfully
   * deleted on disk are removed from the app. If some failed due to files being
   * open elsewhere, an error is thrown.
   */
  public async removeRepository(
    repository: Repository | CloningRepository,
    moveToTrash: boolean
  ): Promise<void> {
    return this.appStore._removeRepository(repository, moveToTrash)
  }

  /** Update the repository's `missing` flag. */
  public async updateRepositoryMissing(
    repository: Repository,
    missing: boolean
  ): Promise<Repository> {
    return this.appStore._updateRepositoryMissing(repository, missing)
  }

  /** Load the next batch of history for the repository. */
  public loadNextCommitBatch(repository: Repository): Promise<void> {
    return this.appStore._loadNextCommitBatch(repository)
  }

  /** Load the changed files for the current history selection. */
  public loadChangedFilesForCurrentSelection(
    repository: Repository
  ): Promise<void> {
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
  public changeCommitSelection(
    repository: Repository,
    shas: ReadonlyArray<string>,
    isContiguous: boolean
  ): void {
    return this.appStore._changeCommitSelection(repository, shas, isContiguous)
  }

  /** Update the shas that should be highlighted */
  public updateShasToHighlight(
    repository: Repository,
    shasToHighlight: ReadonlyArray<string>
  ) {
    this.appStore._updateShasToHighlight(repository, shasToHighlight)
  }

  /**
   * Change the selected changed file in the history view.
   *
   * @param repository The currently active repository instance
   *
   * @param file A FileChange instance among those available in
   *            IHistoryState.changedFiles
   */
  public changeFileSelection(
    repository: Repository,
    file: CommittedFileChange
  ): Promise<void> {
    return this.appStore._changeFileSelection(repository, file)
  }

  /** Set the repository filter text. */
  public setRepositoryFilterText(text: string): Promise<void> {
    return this.appStore._setRepositoryFilterText(text)
  }

  /** Select the repository. */
  public selectRepository(
    repository: Repository | CloningRepository
  ): Promise<Repository | null> {
    return this.appStore._selectRepository(repository)
  }

  /** Change the selected section in the repository. */
  public changeRepositorySection(
    repository: Repository,
    section: RepositorySectionTab
  ): Promise<void> {
    return this.appStore._changeRepositorySection(repository, section)
  }

  /**
   * Changes the selection in the changes view to the working directory and
   * optionally selects one or more files from the working directory.
   *
   *  @param files An array of files to select when showing the working directory.
   *               If undefined this method will preserve the previously selected
   *               files or pick the first changed file if no selection exists.
   */
  public selectWorkingDirectoryFiles(
    repository: Repository,
    selectedFiles?: WorkingDirectoryFileChange[]
  ): Promise<void> {
    return this.appStore._selectWorkingDirectoryFiles(repository, selectedFiles)
  }

  /**
   * Changes the selection in the changes view to the stash entry view and
   * optionally selects a particular file from the current stash entry.
   *
   *  @param file  A file to select when showing the stash entry.
   *               If undefined this method will preserve the previously selected
   *               file or pick the first changed file if no selection exists.
   */
  public selectStashedFile(
    repository: Repository,
    file?: CommittedFileChange | null
  ): Promise<void> {
    return this.appStore._selectStashedFile(repository, file)
  }

  /**
   * Commit the changes which were marked for inclusion, using the given commit
   * summary and description and optionally any number of commit message trailers
   * which will be merged into the final commit message.
   */
  public async commitIncludedChanges(
    repository: Repository,
    context: ICommitContext
  ): Promise<boolean> {
    return this.appStore._commitIncludedChanges(repository, context)
  }

  /** Change the file's includedness. */
  public changeFileIncluded(
    repository: Repository,
    file: WorkingDirectoryFileChange,
    include: boolean
  ): Promise<void> {
    return this.appStore._changeFileIncluded(repository, file, include)
  }

  /** Change the file's line selection state. */
  public changeFileLineSelection(
    repository: Repository,
    file: WorkingDirectoryFileChange,
    diffSelection: DiffSelection
  ): Promise<void> {
    return this.appStore._changeFileLineSelection(
      repository,
      file,
      diffSelection
    )
  }

  /** Change the Include All state. */
  public changeIncludeAllFiles(
    repository: Repository,
    includeAll: boolean
  ): Promise<void> {
    return this.appStore._changeIncludeAllFiles(repository, includeAll)
  }

  /**
   * Refresh the repository. This would be used, e.g., when the app gains focus.
   */
  public refreshRepository(repository: Repository): Promise<void> {
    return this.appStore._refreshOrRecoverRepository(repository)
  }

  /**
   * Refresh the commit author of a repository. Required after changing git's
   * user name or email address.
   */
  public async refreshAuthor(repository: Repository): Promise<void> {
    return this.appStore._refreshAuthor(repository)
  }

  /** Show the popup. This will close any current popup. */
  public showPopup(popup: Popup): Promise<void> {
    return this.appStore._showPopup(popup)
  }

  /**
   * Close the current popup, if found
   *
   * @param popupType only close the popup if it matches this `PopupType`
   */
  public closePopup(popupType?: PopupType) {
    return this.appStore._closePopup(popupType)
  }

  /**
   * Close the popup with given id.
   */
  public closePopupById(popupId: string) {
    return this.appStore._closePopupById(popupId)
  }

  /** Show the foldout. This will close any current popup. */
  public showFoldout(foldout: Foldout): Promise<void> {
    return this.appStore._showFoldout(foldout)
  }

  /** Close the current foldout. If opening a new foldout use closeFoldout instead. */
  public closeCurrentFoldout(): Promise<void> {
    return this.appStore._closeCurrentFoldout()
  }

  /** Close the specified foldout */
  public closeFoldout(foldout: FoldoutType): Promise<void> {
    return this.appStore._closeFoldout(foldout)
  }

  /**
   * Check for remote commits that could affect an rebase operation.
   *
   * @param targetBranch    The branch where the rebase takes place.
   * @param oldestCommitRef Ref of the oldest commit involved in the interactive
   *                        rebase, or tip of the base branch in a regular
   *                        rebase. If it's null, the root of the branch will be
   *                        considered.
   */
  private async warnAboutRemoteCommits(
    repository: Repository,
    targetBranch: Branch,
    oldestCommitRef: string | null
  ): Promise<boolean> {
    if (targetBranch.upstream === null) {
      return false
    }

    // if the branch is tracking a remote branch
    const upstreamBranchesMatching = await getBranches(
      repository,
      `refs/remotes/${targetBranch.upstream}`
    )

    if (upstreamBranchesMatching.length === 0) {
      return false
    }

    // At this point, the target branch has an upstream. Therefore, if the
    // rebase goes up to the root commit of the branch, remote commits that will
    // require a force push after the rebase do exist.
    if (oldestCommitRef === null) {
      return true
    }

    // and the remote branch has commits that don't exist on the base branch
    const remoteCommits = await getCommitsBetweenCommits(
      repository,
      oldestCommitRef,
      targetBranch.upstream
    )

    return remoteCommits !== null && remoteCommits.length > 0
  }

  /** Initialize rebase flow to choose branch step **/
  public async showRebaseDialog(
    repository: Repository,
    initialBranch?: Branch | null
  ) {
    const repositoryState = this.repositoryStateManager.get(repository)
    const initialStep = getMultiCommitOperationChooseBranchStep(
      repositoryState,
      initialBranch
    )

    const { tip } = repositoryState.branchesState
    let currentBranch: Branch | null = null

    if (tip.kind === TipState.Valid) {
      currentBranch = tip.branch
    } else {
      throw new Error(
        'Tip is not in a valid state, which is required to start the rebase flow'
      )
    }

    this.initializeMultiCommitOperation(
      repository,
      {
        kind: MultiCommitOperationKind.Rebase,
        sourceBranch: null,
        commits: [],
        currentTip: tip.branch.tip.sha,
      },
      currentBranch,
      [],
      currentBranch.tip.sha
    )

    this.setMultiCommitOperationStep(repository, initialStep)

    this.showPopup({
      type: PopupType.MultiCommitOperation,
      repository,
    })
  }

  /** Initialize and start the rebase operation */
  public async startRebase(
    repository: Repository,
    baseBranch: Branch,
    targetBranch: Branch,
    commits: ReadonlyArray<CommitOneLine>,
    options?: { continueWithForcePush: boolean }
  ): Promise<void> {
    const { askForConfirmationOnForcePush } = this.appStore.getState()

    const hasOverriddenForcePushCheck =
      options !== undefined && options.continueWithForcePush

    const { branchesState } = this.repositoryStateManager.get(repository)
    const originalBranchTip = getTipSha(branchesState.tip)

    this.appStore._initializeMultiCommitOperation(
      repository,
      {
        kind: MultiCommitOperationKind.Rebase,
        commits,
        currentTip: baseBranch.tip.sha,
        sourceBranch: baseBranch,
      },
      targetBranch,
      commits,
      originalBranchTip
    )

    if (askForConfirmationOnForcePush && !hasOverriddenForcePushCheck) {
      const showWarning = await this.warnAboutRemoteCommits(
        repository,
        baseBranch,
        targetBranch.tip.sha
      )

      if (showWarning) {
        this.setMultiCommitOperationStep(repository, {
          kind: MultiCommitOperationStepKind.WarnForcePush,
          targetBranch,
          baseBranch,
          commits,
        })
        return
      }
    }

    await this.rebase(repository, baseBranch, targetBranch)
  }

  /**
   * Initialize and launch the rebase flow for a conflicted repository
   */
  public async launchRebaseOperation(
    repository: Repository,
    targetBranch: string
  ) {
    await this.appStore._loadStatus(repository)

    const repositoryState = this.repositoryStateManager.get(repository)
    const { conflictState } = repositoryState.changesState

    if (conflictState === null || !isRebaseConflictState(conflictState)) {
      return
    }

    const updatedConflictState = {
      ...conflictState,
      targetBranch,
    }

    this.repositoryStateManager.updateChangesState(repository, () => ({
      conflictState: updatedConflictState,
    }))

    const snapshot = await getRebaseSnapshot(repository)
    if (snapshot === null) {
      return
    }

    const { progress, commits } = snapshot
    this.initializeMultiCommitOperation(
      repository,
      {
        kind: MultiCommitOperationKind.Rebase,
        sourceBranch: null,
        commits,
        currentTip: '',
      },
      null,
      commits,
      targetBranch
    )

    this.repositoryStateManager.updateMultiCommitOperationState(
      repository,
      () => ({
        progress,
      })
    )

    const { manualResolutions } = conflictState
    this.setMultiCommitOperationStep(repository, {
      kind: MultiCommitOperationStepKind.ShowConflicts,
      conflictState: {
        kind: 'multiCommitOperation',
        manualResolutions,
        ourBranch: targetBranch,
        theirBranch: undefined,
      },
    })

    this.showPopup({
      type: PopupType.MultiCommitOperation,
      repository,
    })
  }

  /**
   * Create a new branch from the given starting point and check it out.
   *
   * If the startPoint argument is omitted the new branch will be created based
   * off of the current state of HEAD.
   */
  public createBranch(
    repository: Repository,
    name: string,
    startPoint: string | null,
    noTrackOption: boolean = false
  ): Promise<Branch | undefined> {
    return this.appStore._createBranch(
      repository,
      name,
      startPoint,
      noTrackOption
    )
  }

  /**
   * Create a new tag on the given target commit.
   */
  public createTag(
    repository: Repository,
    name: string,
    targetCommitSha: string
  ): Promise<void> {
    return this.appStore._createTag(repository, name, targetCommitSha)
  }

  /**
   * Deletes the passed tag.
   */
  public deleteTag(repository: Repository, name: string): Promise<void> {
    return this.appStore._deleteTag(repository, name)
  }

  /**
   * Show the tag creation dialog.
   */
  public showCreateTagDialog(
    repository: Repository,
    targetCommitSha: string,
    localTags: Map<string, string> | null,
    initialName?: string
  ): Promise<void> {
    return this.showPopup({
      type: PopupType.CreateTag,
      repository,
      targetCommitSha,
      initialName,
      localTags,
    })
  }

  /**
   * Show the confirmation dialog to delete a tag.
   */
  public showDeleteTagDialog(
    repository: Repository,
    tagName: string
  ): Promise<void> {
    return this.showPopup({
      type: PopupType.DeleteTag,
      repository,
      tagName,
    })
  }

  /** Check out the given branch. */
  public checkoutBranch(
    repository: Repository,
    branch: Branch,
    strategy?: UncommittedChangesStrategy
  ): Promise<Repository> {
    return this.appStore._checkoutBranch(repository, branch, strategy)
  }

  /** Check out the given commit. */
  public checkoutCommit(
    repository: Repository,
    commit: CommitOneLine
  ): Promise<Repository> {
    return this.appStore._checkoutCommit(repository, commit)
  }

  /** Push the current branch. */
  public push(repository: Repository): Promise<void> {
    return this.appStore._push(repository)
  }

  private pushWithOptions(repository: Repository, options?: PushOptions) {
    if (options !== undefined && options.forceWithLease) {
      this.dropCurrentBranchFromForcePushList(repository)
    }

    return this.appStore._push(repository, options)
  }

  /** Pull the current branch. */
  public pull(repository: Repository): Promise<void> {
    return this.appStore._pull(repository)
  }

  /** Fetch a specific refspec for the repository. */
  public fetchRefspec(
    repository: Repository,
    fetchspec: string
  ): Promise<void> {
    return this.appStore._fetchRefspec(repository, fetchspec)
  }

  /** Fetch all refs for the repository */
  public fetch(repository: Repository, fetchType: FetchType): Promise<void> {
    return this.appStore._fetch(repository, fetchType)
  }

  /** Publish the repository to GitHub with the given properties. */
  public publishRepository(
    repository: Repository,
    name: string,
    description: string,
    private_: boolean,
    account: Account,
    org: IAPIOrganization | null
  ): Promise<Repository> {
    return this.appStore._publishRepository(
      repository,
      name,
      description,
      private_,
      account,
      org
    )
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

      if (!currentError) {
        break
      }
    }

    if (currentError) {
      fatalError(
        `Unhandled error ${currentError}. This shouldn't happen! All errors should be handled, even if it's just by the default handler.`
      )
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

  /**
   * Clone a missing repository to the previous path, and update it's
   * state in the repository list if the clone completes without error.
   */
  public cloneAgain(url: string, path: string): Promise<void> {
    return this.appStore._cloneAgain(url, path)
  }

  /** Clone the repository to the path. */
  public async clone(
    url: string,
    path: string,
    options?: { branch?: string; defaultBranch?: string }
  ): Promise<Repository | null> {
    return this.appStore._completeOpenInDesktop(async () => {
      const { promise, repository } = this.appStore._clone(url, path, options)
      await this.selectRepository(repository)
      const success = await promise
      // TODO: this exit condition is not great, bob
      if (!success) {
        return null
      }

      const addedRepositories = await this.addRepositories([path])

      if (addedRepositories.length < 1) {
        return null
      }

      const addedRepository = addedRepositories[0]
      await this.selectRepository(addedRepository)

      if (isRepositoryWithForkedGitHubRepository(addedRepository)) {
        this.showPopup({
          type: PopupType.ChooseForkSettings,
          repository: addedRepository,
        })
      }

      return addedRepository
    })
  }

  /** Changes the repository alias to a new name. */
  public changeRepositoryAlias(
    repository: Repository,
    newAlias: string | null
  ): Promise<void> {
    return this.appStore._changeRepositoryAlias(repository, newAlias)
  }

  /** Rename the branch to a new name. */
  public renameBranch(
    repository: Repository,
    branch: Branch,
    newName: string
  ): Promise<void> {
    return this.appStore._renameBranch(repository, branch, newName)
  }

  /**
   * Delete the branch. This will delete both the local branch and the remote
   * branch if includeUpstream is true, and then check out the default branch.
   */
  public deleteLocalBranch(
    repository: Repository,
    branch: Branch,
    includeUpstream?: boolean
  ): Promise<void> {
    return this.appStore._deleteBranch(repository, branch, includeUpstream)
  }

  /**
   * Delete the remote branch.
   */
  public deleteRemoteBranch(
    repository: Repository,
    branch: Branch
  ): Promise<void> {
    return this.appStore._deleteBranch(repository, branch)
  }

  /** Discard the changes to the given files. */
  public discardChanges(
    repository: Repository,
    files: ReadonlyArray<WorkingDirectoryFileChange>,
    moveToTrash: boolean = true
  ): Promise<void> {
    return this.appStore._discardChanges(repository, files, moveToTrash)
  }

  /** Discard the changes from the given diff selection. */
  public discardChangesFromSelection(
    repository: Repository,
    filePath: string,
    diff: ITextDiff,
    selection: DiffSelection
  ): Promise<void> {
    return this.appStore._discardChangesFromSelection(
      repository,
      filePath,
      diff,
      selection
    )
  }

  /** Start amending the most recent commit. */
  public async startAmendingRepository(
    repository: Repository,
    commit: Commit,
    isLocalCommit: boolean,
    continueWithForcePush: boolean = false
  ) {
    this.appStore._startAmendingRepository(
      repository,
      commit,
      isLocalCommit,
      continueWithForcePush
    )
  }

  /** Stop amending the most recent commit. */
  public async stopAmendingRepository(repository: Repository) {
    this.appStore._stopAmendingRepository(repository)
  }

  /** Undo the given commit. */
  public undoCommit(
    repository: Repository,
    commit: Commit,
    showConfirmationDialog: boolean = true
  ): Promise<void> {
    return this.appStore._undoCommit(repository, commit, showConfirmationDialog)
  }

  /** Reset to a given commit. */
  public resetToCommit(
    repository: Repository,
    commit: Commit,
    showConfirmationDialog: boolean = true
  ): Promise<void> {
    this.statsStore.increment('resetToCommitCount')
    return this.appStore._resetToCommit(
      repository,
      commit,
      showConfirmationDialog
    )
  }

  /** Revert the commit with the given SHA */
  public revertCommit(repository: Repository, commit: Commit): Promise<void> {
    return this.appStore._revertCommit(repository, commit)
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
   * Set the width of the Branch toolbar button to the given value.
   * This affects the toolbar button and its dropdown element.
   *
   * @param width The value for the width of Branch button
   */
  public setBranchDropdownWidth(width: number): Promise<void> {
    return this.appStore._setBranchDropdownWidth(width)
  }

  /**
   * Reset the width of the Branch toolbar button to its default value.
   */
  public resetBranchDropdownWidth(): Promise<void> {
    return this.appStore._resetBranchDropdownWidth()
  }

  /**
   * Set the width of the Push/Push toolbar button to the given value.
   * This affects the toolbar button and its dropdown element.
   *
   * @param width The value for the width of Push/Pull button
   */
  public setPushPullButtonWidth(width: number): Promise<void> {
    return this.appStore._setPushPullButtonWidth(width)
  }

  /**
   * Reset the width of the Push/Pull toolbar button to its default
   * value.
   */
  public resetPushPullButtonWidth(): Promise<void> {
    return this.appStore._resetPushPullButtonWidth()
  }

  /**
   * Set the update banner's visibility
   */
  public setUpdateBannerVisibility(isVisible: boolean) {
    return this.appStore._setUpdateBannerVisibility(isVisible)
  }

  /**
   * Set the update show case visibility
   */
  public setUpdateShowCaseVisibility(isVisible: boolean) {
    return this.appStore._setUpdateShowCaseVisibility(isVisible)
  }

  /**
   * Set the banner state for the application
   */
  public setBanner(state: Banner) {
    return this.appStore._setBanner(state)
  }

  /**
   * Close the current banner, if found.
   *
   * @param bannerType only close the banner if it matches this `BannerType`
   */
  public clearBanner(bannerType?: BannerType) {
    return this.appStore._clearBanner(bannerType)
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
  public refreshIssues(repository: GitHubRepository): Promise<void> {
    return this.appStore._refreshIssues(repository)
  }

  /** End the Welcome flow. */
  public endWelcomeFlow(): Promise<void> {
    return this.appStore._endWelcomeFlow()
  }

  /** Set the commit message input's focus. */
  public setCommitMessageFocus(focus: boolean) {
    this.appStore._setCommitMessageFocus(focus)
  }

  /**
   * Set the commit summary and description for a work-in-progress
   * commit in the changes view for a particular repository.
   */
  public setCommitMessage(
    repository: Repository,
    message: ICommitMessage
  ): Promise<void> {
    return this.appStore._setCommitMessage(repository, message)
  }

  /** Remove the given account from the app. */
  public removeAccount(account: Account): Promise<void> {
    return this.appStore._removeAccount(account)
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
  public mergeBranch(
    repository: Repository,
    branch: Branch,
    mergeStatus: MergeTreeResult | null,
    isSquash: boolean = false
  ): Promise<void> {
    return this.appStore._mergeBranch(repository, branch, mergeStatus, isSquash)
  }

  /**
   * Update the per-repository list of branches that can be force-pushed
   * after a rebase or amend is completed.
   */
  private addBranchToForcePushList = (
    repository: Repository,
    tipWithBranch: IValidBranch,
    beforeChangeSha: string
  ) => {
    this.appStore._addBranchToForcePushList(
      repository,
      tipWithBranch,
      beforeChangeSha
    )
  }

  private dropCurrentBranchFromForcePushList = (repository: Repository) => {
    const currentState = this.repositoryStateManager.get(repository)
    const { forcePushBranches: rebasedBranches, tip } =
      currentState.branchesState

    if (tip.kind !== TipState.Valid) {
      return
    }

    const updatedMap = new Map<string, string>(rebasedBranches)
    updatedMap.delete(tip.branch.nameWithoutRemote)

    this.repositoryStateManager.updateBranchesState(repository, () => ({
      forcePushBranches: updatedMap,
    }))
  }

  /**
   * Update the rebase state to indicate the user has resolved conflicts in the
   * current repository.
   */
  public setConflictsResolved(repository: Repository) {
    return this.appStore._setConflictsResolved(repository)
  }

  /** Starts a rebase for the given base and target branch */
  public async rebase(
    repository: Repository,
    baseBranch: Branch,
    targetBranch: Branch
  ): Promise<void> {
    const { branchesState, multiCommitOperationState } =
      this.repositoryStateManager.get(repository)

    if (
      multiCommitOperationState == null ||
      multiCommitOperationState.operationDetail.kind !==
        MultiCommitOperationKind.Rebase
    ) {
      return
    }
    const { commits } = multiCommitOperationState.operationDetail

    const beforeSha = getTipSha(branchesState.tip)

    log.info(
      `[rebase] starting rebase for ${targetBranch.name} at ${beforeSha}`
    )
    log.info(
      `[rebase] to restore the previous state if this completed rebase is unsatisfactory:`
    )
    log.info(`[rebase] - git checkout ${targetBranch.name}`)
    log.info(`[rebase] - git reset ${beforeSha} --hard`)

    const result = await this.appStore._rebase(
      repository,
      baseBranch,
      targetBranch
    )

    await this.appStore._loadStatus(repository)

    const stateAfter = this.repositoryStateManager.get(repository)
    const { tip } = stateAfter.branchesState
    const afterSha = getTipSha(tip)

    log.info(
      `[rebase] completed rebase - got ${result} and on tip ${afterSha} - kind ${tip.kind}`
    )

    if (result === RebaseResult.ConflictsEncountered) {
      const { conflictState } = stateAfter.changesState
      if (conflictState === null) {
        log.warn(
          `[rebase] conflict state after rebase is null - unable to continue`
        )
        return
      }

      if (!isRebaseConflictState(conflictState)) {
        log.warn(
          `[rebase] conflict state after rebase is not rebase conflicts - unable to continue`
        )
        return
      }

      return this.startMultiCommitOperationConflictFlow(
        MultiCommitOperationKind.Rebase,
        repository,
        baseBranch.name,
        targetBranch.name
      )
    } else if (result === RebaseResult.AlreadyUpToDate) {
      if (tip.kind !== TipState.Valid) {
        log.warn(
          `[rebase] tip after already up to date is ${tip.kind} but this should be a valid tip if the rebase completed without error`
        )
        return
      }

      const { operationDetail } = multiCommitOperationState
      const { sourceBranch } = operationDetail

      const ourBranch = targetBranch !== null ? targetBranch.name : ''
      const theirBranch = sourceBranch !== null ? sourceBranch.name : ''

      const banner: Banner = {
        type: BannerType.BranchAlreadyUpToDate,
        ourBranch,
        theirBranch,
      }

      this.statsStore.increment('rebaseWithBranchAlreadyUpToDateCount')

      this.setBanner(banner)
      this.endMultiCommitOperation(repository)
      await this.refreshRepository(repository)
    } else if (result === RebaseResult.CompletedWithoutError) {
      if (tip.kind !== TipState.Valid) {
        log.warn(
          `[rebase] tip after completing rebase is ${tip.kind} but this should be a valid tip if the rebase completed without error`
        )
        return
      }

      this.statsStore.increment('rebaseSuccessWithoutConflictsCount')
      await this.completeMultiCommitOperation(repository, commits.length)
    } else if (result === RebaseResult.Error) {
      // we were unable to successfully start the rebase, and an error should
      // be shown through the default error handling infrastructure, so we can
      // just abandon the rebase for now
      this.endMultiCommitOperation(repository)
    }
  }

  /** Abort the current rebase and refreshes the repository status */
  public async abortRebase(repository: Repository) {
    await this.appStore._abortRebase(repository)
    await this.appStore._loadStatus(repository)
    await this.refreshRepository(repository)
  }

  /**
   * Continue with the rebase after the user has resolved all conflicts with
   * tracked files in the working directory.
   */
  public async continueRebase(
    kind: MultiCommitOperationKind,
    repository: Repository,
    workingDirectory: WorkingDirectoryStatus,
    conflictsState: RebaseConflictState
  ): Promise<RebaseResult> {
    const stateBefore = this.repositoryStateManager.get(repository)
    const { manualResolutions } = conflictsState

    const beforeSha = getTipSha(stateBefore.branchesState.tip)

    log.info(`[continueRebase] continuing rebase for ${beforeSha}`)

    const result = await this.appStore._continueRebase(
      repository,
      workingDirectory,
      manualResolutions
    )

    // At this point, given continueRebase was invoked, we can assume that the
    // rebase encountered some conflicts and they have been resolved. Getting
    // now a CompletedWithoutError result means that the rebase has completed
    // successfully and there aren't more conflicts to resolve, therefore we can
    // track this as a successful rebase with conflicts.
    if (result === RebaseResult.CompletedWithoutError) {
      this.statsStore.recordOperationSuccessfulWithConflicts(kind)
    }

    await this.appStore._loadStatus(repository)

    const stateAfter = this.repositoryStateManager.get(repository)
    const { tip } = stateAfter.branchesState
    const afterSha = getTipSha(tip)

    log.info(
      `[continueRebase] completed rebase - got ${result} and on tip ${afterSha} - kind ${tip.kind}`
    )

    return result
  }

  /** aborts an in-flight merge and refreshes the repository's status */
  public async abortMerge(repository: Repository) {
    await this.appStore._abortMerge(repository)
    await this.appStore._loadStatus(repository)
  }

  /** aborts an in-flight merge and refreshes the repository's status */
  public async abortSquashMerge(repository: Repository) {
    await this.appStore._abortSquashMerge(repository)
    return this.appStore._refreshRepository(repository)
  }

  /**
   * commits an in-flight merge and shows a banner if successful
   *
   * @param repository
   * @param workingDirectory
   * @param successfulMergeBannerState information for banner to be displayed if merge is successful
   */
  public async finishConflictedMerge(
    repository: Repository,
    workingDirectory: WorkingDirectoryStatus,
    successfulMergeBanner: Banner,
    isSquash: boolean
  ) {
    // get manual resolutions in case there are manual conflicts
    const repositoryState = this.repositoryStateManager.get(repository)
    const { conflictState } = repositoryState.changesState
    if (conflictState === null) {
      // if this doesn't exist, something is very wrong and we shouldn't proceed 😢
      log.error(
        'Conflict state missing during finishConflictedMerge. No merge will be committed.'
      )
      return
    }
    const result = await this.appStore._finishConflictedMerge(
      repository,
      workingDirectory,
      conflictState.manualResolutions
    )
    if (result !== undefined) {
      this.setBanner(successfulMergeBanner)
      if (isSquash) {
        // Squash merge will not hit the normal recording of successful merge in
        // app-store._mergeBranch because it only records there when there are
        // no conflicts. Thus, recordSquashMergeSuccessful is done here in order
        // to capture all successful squash merges under this metric.
        this.statsStore.increment('squashMergeSuccessfulCount')
        this.statsStore.increment('squashMergeSuccessfulWithConflictsCount')
      }
    }
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
  public setRemoteURL(
    repository: Repository,
    name: string,
    url: string
  ): Promise<void> {
    return this.appStore._setRemoteURL(repository, name, url)
  }

  /** Open the URL in a browser */
  public openInBrowser(url: string): Promise<boolean> {
    return this.appStore._openInBrowser(url)
  }

  /** Add the pattern to the repository's gitignore. */
  public appendIgnoreRule(
    repository: Repository,
    pattern: string | string[]
  ): Promise<void> {
    return this.appStore._appendIgnoreRule(repository, pattern)
  }

  /**
   * Convenience method to add the given file path(s) to the repository's gitignore.
   *
   * The file path will be escaped before adding.
   */
  public appendIgnoreFile(
    repository: Repository,
    filePath: string | string[]
  ): Promise<void> {
    return this.appStore._appendIgnoreFile(repository, filePath)
  }

  /** Opens a Git-enabled terminal setting the working directory to the repository path */
  public async openShell(
    path: string,
    ignoreWarning: boolean = false
  ): Promise<void> {
    const gitFound = await isGitOnPath()
    if (gitFound || ignoreWarning) {
      this.appStore._openShell(path)
    } else {
      this.appStore._showPopup({
        type: PopupType.InstallGit,
        path,
      })
    }
  }

  /**
   * Opens a path in the external editor selected by the user.
   */
  public async openInExternalEditor(fullPath: string): Promise<void> {
    return this.appStore._openInExternalEditor(fullPath)
  }

  /**
   * Persist the given content to the repository's root .gitignore.
   *
   * If the repository root doesn't contain a .gitignore file one
   * will be created, otherwise the current file will be overwritten.
   */
  public saveGitIgnore(repository: Repository, text: string): Promise<void> {
    return this.appStore._saveGitIgnore(repository, text)
  }

  /** Set whether the user has opted out of stats reporting. */
  public setStatsOptOut(
    optOut: boolean,
    userViewedPrompt: boolean
  ): Promise<void> {
    return this.appStore.setStatsOptOut(optOut, userViewedPrompt)
  }

  public setUseExternalCredentialHelper(useExternalCredentialHelper: boolean) {
    return this.appStore._setUseExternalCredentialHelper(
      useExternalCredentialHelper
    )
  }

  /** Moves the app to the /Applications folder on macOS. */
  public moveToApplicationsFolder() {
    return moveToApplicationsFolder()
  }

  /**
   * Clear any in-flight sign in state and return to the
   * initial (no sign-in) state.
   */
  public resetSignInState() {
    return this.appStore._resetSignInState()
  }

  /**
   * Initiate a sign in flow for a GitHub Enterprise instance. This will
   * put the store in the EndpointEntry step ready to receive the url
   * to the enterprise instance.
   */
  public beginEnterpriseSignIn(
    resultCallback?: (result: SignInResult) => void
  ) {
    this.appStore._beginEnterpriseSignIn(resultCallback)
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
  public setSignInCredentials(
    username: string,
    password: string
  ): Promise<void> {
    return this.appStore._setSignInCredentials(username, password)
  }

  public beginDotComSignIn(resultCallback: (result: SignInResult) => void) {
    this.appStore._beginDotComSignIn(resultCallback)
  }

  public beginBrowserBasedSignIn(
    endpoint: string,
    resultCallback?: (result: SignInResult) => void
  ) {
    if (
      endpoint === getDotComAPIEndpoint() ||
      new URL(endpoint).hostname === 'github.com'
    ) {
      this.appStore._beginDotComSignIn(resultCallback)
      this.requestBrowserAuthentication()
    } else {
      this.appStore._beginEnterpriseSignIn(resultCallback)
      this.appStore
        ._setSignInEndpoint(endpoint)
        .then(() => this.requestBrowserAuthentication())
        .catch(e => log.error(`Error setting sign in endpoint`, e))
    }
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
  public requestBrowserAuthentication() {
    this.appStore._requestBrowserAuthentication()
  }

  /**
   * Initiate an OAuth sign in using the system configured browser to GitHub.com.
   *
   * The promise returned will only resolve once the user has successfully
   * authenticated. If the user terminates the sign-in process by closing
   * their browser before the protocol handler is invoked, by denying the
   * protocol handler to execute or by providing the wrong credentials
   * this promise will never complete.
   */
  public requestBrowserAuthenticationToDotcom(
    resultCallback?: (result: SignInResult) => void
  ) {
    this.appStore._beginDotComSignIn(resultCallback)
    this.requestBrowserAuthentication()
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
  public async showDotComSignInDialog(
    resultCallback?: (result: SignInResult) => void
  ): Promise<void> {
    this.appStore._beginDotComSignIn(resultCallback)
    this.appStore._showPopup({ type: PopupType.SignIn })
  }

  /**
   * Launch a sign in dialog for authenticating a user with
   * a GitHub Enterprise instance.
   * Optionally, you can provide an endpoint URL.
   */
  public async showEnterpriseSignInDialog(
    endpoint?: string,
    resultCallback?: (result: SignInResult) => void
  ): Promise<void> {
    this.appStore._beginEnterpriseSignIn(resultCallback)

    if (endpoint !== undefined) {
      this.appStore._setSignInEndpoint(endpoint)
    }

    this.appStore._showPopup({ type: PopupType.SignIn })
  }

  /**
   * Show a dialog that helps the user create a fork of
   * their local repo.
   */
  public async showCreateForkDialog(
    repository: RepositoryWithGitHubRepository
  ): Promise<void> {
    await this.appStore._showCreateForkDialog(repository)
  }

  public async showUnknownAuthorsCommitWarning(
    authors: ReadonlyArray<UnknownAuthor>,
    onCommitAnyway: () => void
  ) {
    return this.appStore._showPopup({
      type: PopupType.UnknownAuthors,
      authors,
      onCommit: onCommitAnyway,
    })
  }

  public async showRepoRulesCommitBypassWarning(
    repository: GitHubRepository,
    branch: string,
    onConfirm: () => void
  ) {
    return this.appStore._showPopup({
      type: PopupType.ConfirmRepoRulesBypass,
      repository,
      branch,
      onConfirm,
    })
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
    const path = await showOpenDialog({
      properties: ['openDirectory'],
    })

    if (path !== null) {
      await this.updateRepositoryPath(repository, path)
    }
  }

  /**
   * Change the workflow preferences for the specified repository.
   *
   * @param repository            The repository to update.
   * @param workflowPreferences   The object with the workflow settings to use.
   */
  public async updateRepositoryWorkflowPreferences(
    repository: Repository,
    workflowPreferences: WorkflowPreferences
  ) {
    await this.appStore._updateRepositoryWorkflowPreferences(
      repository,
      workflowPreferences
    )
  }

  /** Update the repository's path. */
  private async updateRepositoryPath(
    repository: Repository,
    path: string
  ): Promise<void> {
    await this.appStore._updateRepositoryPath(repository, path)
  }

  public async setAppFocusState(isFocused: boolean): Promise<void> {
    await this.appStore._setAppFocusState(isFocused)

    if (isFocused) {
      this.commitStatusStore.startBackgroundRefresh()
    } else {
      this.commitStatusStore.stopBackgroundRefresh()
    }
  }

  public async initializeAppFocusState(): Promise<void> {
    const isFocused = await isWindowFocused()
    this.setAppFocusState(isFocused)
  }

  /**
   * Find an existing repository that can be used for checking out
   * the passed pull request.
   *
   * This method will try to find an opened repository that matches the
   * HEAD repository of the PR first and if not found it will try to
   * find an opened repository that matches the BASE repository of the PR.
   * Matching in this context means that either the origin remote or the
   * upstream remote url are equal to the PR ref repository URL.
   *
   * With this logic we try to select the best suited repository to open
   * a PR when triggering a "Open PR from Desktop" action from a browser.
   *
   * @param pullRequest the pull request object received from the API.
   */
  private getRepositoryFromPullRequest(
    pullRequest: IAPIPullRequest
  ): RepositoryWithGitHubRepository | null {
    const state = this.appStore.getState()
    const repositories = state.repositories
    const headUrl = pullRequest.head.repo?.clone_url
    const baseUrl = pullRequest.base.repo?.clone_url

    // This likely means that the base repository has been deleted
    // and we don't support checking out from refs/pulls/NNN/head
    // yet so we'll bail for now.
    if (headUrl === undefined || baseUrl === undefined) {
      return null
    }

    for (const repository of repositories) {
      if (this.doesRepositoryMatchUrl(repository, headUrl)) {
        return repository
      }
    }

    for (const repository of repositories) {
      if (this.doesRepositoryMatchUrl(repository, baseUrl)) {
        return repository
      }
    }

    return null
  }

  private doesRepositoryMatchUrl(
    repo: Repository | CloningRepository,
    url: string
  ): repo is RepositoryWithGitHubRepository {
    if (repo instanceof Repository && isRepositoryWithGitHubRepository(repo)) {
      const originRepoUrl = repo.gitHubRepository.htmlURL
      const upstreamRepoUrl = repo.gitHubRepository.parent?.htmlURL ?? null

      if (originRepoUrl !== null && urlsMatch(originRepoUrl, url)) {
        return true
      }

      if (upstreamRepoUrl !== null && urlsMatch(upstreamRepoUrl, url)) {
        return true
      }
    }

    return false
  }

  private async openRepositoryFromUrl(action: IOpenRepositoryFromURLAction) {
    const { url, pr, branch, filepath } = action

    let repository: Repository | null

    if (pr !== null) {
      repository = await this.openPullRequestFromUrl(url, pr)
    } else if (branch !== null) {
      repository = await this.openBranchNameFromUrl(url, branch)
    } else {
      repository = await this.openOrCloneRepository(url)
    }

    if (repository === null) {
      return
    }

    if (filepath !== null) {
      const resolved = await resolveWithin(repository.path, filepath)

      if (resolved !== null) {
        shell.showItemInFolder(resolved)
      } else {
        log.error(
          `Prevented attempt to open path outside of the repository root: ${filepath}`
        )
      }
    }
  }

  private async openBranchNameFromUrl(
    url: string,
    branchName: string
  ): Promise<Repository | null> {
    const repository = await this.openOrCloneRepository(url)

    if (repository === null) {
      return null
    }

    // ensure a fresh clone repository has it's in-memory state
    // up-to-date before performing the "Clone in Desktop" steps
    await this.appStore._refreshRepository(repository)

    // if the repo has a remote, fetch before switching branches to ensure
    // the checkout will be successful. This operation could be a no-op.
    await this.appStore._fetch(repository, FetchType.UserInitiatedTask)

    await this.checkoutLocalBranch(repository, branchName)

    return repository
  }

  private async openPullRequestFromUrl(
    url: string,
    pr: string
  ): Promise<RepositoryWithGitHubRepository | null> {
    const pullRequest = await this.appStore.fetchPullRequest(url, pr)

    if (pullRequest === null) {
      return null
    }

    // Find the repository where the PR is created in Desktop.
    let repository: Repository | null =
      this.getRepositoryFromPullRequest(pullRequest)

    if (repository !== null) {
      await this.selectRepository(repository)
    } else {
      repository = await this.openOrCloneRepository(url)
    }

    if (repository === null) {
      log.warn(
        `Open Repository from URL failed, did not find or clone repository: ${url}`
      )
      return null
    }
    if (!isRepositoryWithGitHubRepository(repository)) {
      log.warn(
        `Received a non-GitHub repository when opening repository from URL: ${url}`
      )
      return null
    }

    // ensure a fresh clone repository has it's in-memory state
    // up-to-date before performing the "Clone in Desktop" steps
    await this.appStore._refreshRepository(repository)

    if (pullRequest.head.repo === null) {
      return null
    }

    await this.appStore._checkoutPullRequest(
      repository,
      pullRequest.number,
      pullRequest.head.repo.owner.login,
      pullRequest.head.repo.clone_url,
      pullRequest.head.ref
    )

    return repository
  }

  public async dispatchURLAction(action: URLActionType): Promise<void> {
    switch (action.name) {
      case 'oauth':
        await this.appStore._resolveOAuthRequest(action)

        if (__DARWIN__) {
          // workaround for user reports that the application doesn't receive focus
          // after completing the OAuth signin in the browser
          const isFocused = await isWindowFocused()
          if (!isFocused) {
            log.info(
              `refocusing the main window after the OAuth flow is completed`
            )
            window.focus()
          }
        }
        break

      case 'open-repository-from-url':
        this.openRepositoryFromUrl(action)
        break

      case 'open-repository-from-path':
        // user may accidentally provide a folder within the repository
        // this ensures we use the repository root, if it is actually a repository
        // otherwise we consider it an untracked repository
        const path = await getRepositoryType(action.path)
          .then(t =>
            t.kind === 'regular' ? t.topLevelWorkingDirectory : action.path
          )
          .catch(e => {
            log.error('Could not determine repository type', e)
            return action.path
          })

        const { repositories } = this.appStore.getState()
        const existingRepository = matchExistingRepository(repositories, path)

        if (existingRepository) {
          await this.selectRepository(existingRepository)
          this.statsStore.recordAddExistingRepository()
        } else {
          await this.showPopup({ type: PopupType.AddRepository, path })
        }
        break

      default:
        const unknownAction: IUnknownAction = action
        log.warn(
          `Unknown URL action: ${
            unknownAction.name
          } - payload: ${JSON.stringify(unknownAction)}`
        )
    }
  }

  /**
   * Sets the user's preference so that moving the app to /Applications is not asked
   */
  public setAskToMoveToApplicationsFolderSetting(
    value: boolean
  ): Promise<void> {
    return this.appStore._setAskToMoveToApplicationsFolderSetting(value)
  }

  /**
   * Sets the user's preference so that confirmation to remove repo is not asked
   */
  public setConfirmRepoRemovalSetting(value: boolean): Promise<void> {
    return this.appStore._setConfirmRepositoryRemovalSetting(value)
  }

  /**
   * Sets the user's preference so that confirmation to discard changes is not asked
   */
  public setConfirmDiscardChangesSetting(value: boolean): Promise<void> {
    return this.appStore._setConfirmDiscardChangesSetting(value)
  }

  /**
   * Sets the user's preference so that confirmation to retry discard changes
   * after failure is not asked
   */
  public setConfirmDiscardChangesPermanentlySetting(
    value: boolean
  ): Promise<void> {
    return this.appStore._setConfirmDiscardChangesPermanentlySetting(value)
  }

  /**
   * Sets the user's preference for handling uncommitted changes when switching branches
   */
  public setUncommittedChangesStrategySetting(
    value: UncommittedChangesStrategy
  ): Promise<void> {
    return this.appStore._setUncommittedChangesStrategySetting(value)
  }

  /**
   * Sets the user's preference for an external program to open repositories in.
   */
  public setExternalEditor(editor: string): Promise<void> {
    return this.appStore._setExternalEditor(editor)
  }

  /**
   * Sets the user's preferred shell.
   */
  public setShell(shell: Shell): Promise<void> {
    return this.appStore._setShell(shell)
  }

  private async checkoutLocalBranch(repository: Repository, branch: string) {
    let shouldCheckoutBranch = true

    const state = this.repositoryStateManager.get(repository)
    const branches = state.branchesState.allBranches

    const { tip } = state.branchesState

    if (tip.kind === TipState.Valid) {
      shouldCheckoutBranch = tip.branch.nameWithoutRemote !== branch
    }

    const localBranch = branches.find(b => b.nameWithoutRemote === branch)

    // N.B: This looks weird, and it is. _checkoutBranch used
    // to behave this way (silently ignoring checkout) when given
    // a branch name string that does not correspond to a local branch
    // in the git store. When rewriting _checkoutBranch
    // to remove the support for string branch names the behavior
    // was moved up to this method to not alter the current behavior.
    //
    // https://youtu.be/IjmtVKOAHPM
    if (shouldCheckoutBranch && localBranch !== undefined) {
      await this.checkoutBranch(repository, localBranch)
    }
  }

  private async openOrCloneRepository(url: string): Promise<Repository | null> {
    const state = this.appStore.getState()
    const repositories = state.repositories
    const existingRepository = repositories.find(r =>
      this.doesRepositoryMatchUrl(r, url)
    )

    if (existingRepository) {
      return await this.selectRepository(existingRepository)
    }

    return this.appStore._startOpenInDesktop(() => {
      this.changeCloneRepositoriesTab(CloneRepositoryTab.Generic)
      this.showPopup({
        type: PopupType.CloneRepository,
        initialURL: url,
      })
    })
  }

  public async openOrAddRepository(path: string): Promise<Repository | null> {
    const state = this.appStore.getState()
    const repositories = state.repositories
    const existingRepository = repositories.find(r => r.path === path)

    if (existingRepository) {
      return await this.selectRepository(existingRepository)
    }

    return this.appStore._startOpenInDesktop(() => {
      this.showPopup({
        type: PopupType.AddRepository,
        path,
      })
    })
  }

  /**
   * Install the CLI tool.
   *
   * This is used only on macOS.
   */
  public async installDarwinCLI() {
    try {
      await installCLI()

      this.showPopup({ type: PopupType.CLIInstalled })
    } catch (e) {
      log.error('Error installing CLI', e)

      this.postError(e)
    }
  }

  /** Save the generic git credentials. */
  public async saveGenericGitCredentials(
    hostname: string,
    username: string,
    password: string
  ): Promise<void> {
    log.info(`storing generic credentials for '${hostname}' and '${username}'`)
    setGenericUsername(hostname, username)

    try {
      await setGenericPassword(hostname, username, password)
    } catch (e) {
      log.error(
        `Error saving generic git credentials: ${username}@${hostname}`,
        e
      )

      this.postError(e)
    }
  }

  /** Perform the given retry action. */
  public async performRetry(retryAction: RetryAction): Promise<void> {
    switch (retryAction.type) {
      case RetryActionType.Push:
        return this.push(retryAction.repository)

      case RetryActionType.Pull:
        return this.pull(retryAction.repository)

      case RetryActionType.Fetch:
        return this.fetch(retryAction.repository, FetchType.UserInitiatedTask)

      case RetryActionType.Clone:
        await this.clone(retryAction.url, retryAction.path, retryAction.options)
        break

      case RetryActionType.Checkout:
        await this.checkoutBranch(retryAction.repository, retryAction.branch)
        break

      case RetryActionType.Merge:
        return this.mergeBranch(
          retryAction.repository,
          retryAction.theirBranch,
          null
        )

      case RetryActionType.Rebase:
        return this.rebase(
          retryAction.repository,
          retryAction.baseBranch,
          retryAction.targetBranch
        )
      case RetryActionType.CherryPick:
        return this.cherryPick(
          retryAction.repository,
          retryAction.targetBranch,
          retryAction.commits,
          retryAction.sourceBranch
        )
      case RetryActionType.CreateBranchForCherryPick:
        return this.startCherryPickWithBranchName(
          retryAction.repository,
          retryAction.targetBranchName,
          retryAction.startPoint,
          retryAction.noTrackOption,
          retryAction.commits,
          retryAction.sourceBranch
        )
      case RetryActionType.Squash:
        return this.squash(
          retryAction.repository,
          retryAction.toSquash,
          retryAction.squashOnto,
          retryAction.lastRetainedCommitRef,
          retryAction.commitContext
        )
      case RetryActionType.Reorder:
        return this.reorderCommits(
          retryAction.repository,
          retryAction.commitsToReorder,
          retryAction.beforeCommit,
          retryAction.lastRetainedCommitRef
        )
      case RetryActionType.DiscardChanges:
        return this.discardChanges(
          retryAction.repository,
          retryAction.files,
          false
        )
      default:
        return assertNever(retryAction, `Unknown retry action: ${retryAction}`)
    }
  }

  /** Change the selected image diff type. */
  public changeImageDiffType(type: ImageDiffType): Promise<void> {
    return this.appStore._changeImageDiffType(type)
  }

  /** Change the hide whitespace in changes diff setting */
  public onHideWhitespaceInChangesDiffChanged(
    hideWhitespaceInDiff: boolean,
    repository: Repository
  ): Promise<void> {
    return this.appStore._setHideWhitespaceInChangesDiff(
      hideWhitespaceInDiff,
      repository
    )
  }

  /** Change the hide whitespace in history diff setting */
  public onHideWhitespaceInHistoryDiffChanged(
    hideWhitespaceInDiff: boolean,
    repository: Repository,
    file: CommittedFileChange | null = null
  ): Promise<void> {
    return this.appStore._setHideWhitespaceInHistoryDiff(
      hideWhitespaceInDiff,
      repository,
      file
    )
  }

  /** Change the hide whitespace in pull request diff setting */
  public onHideWhitespaceInPullRequestDiffChanged(
    hideWhitespaceInDiff: boolean,
    repository: Repository,
    file: CommittedFileChange | null = null
  ) {
    this.appStore._setHideWhitespaceInPullRequestDiff(
      hideWhitespaceInDiff,
      repository,
      file
    )
  }

  /** Change the side by side diff setting */
  public onShowSideBySideDiffChanged(showSideBySideDiff: boolean) {
    return this.appStore._setShowSideBySideDiff(showSideBySideDiff)
  }

  /** Install the global Git LFS filters. */
  public installGlobalLFSFilters(force: boolean): Promise<void> {
    return this.appStore._installGlobalLFSFilters(force)
  }

  /** Install the LFS filters */
  public installLFSHooks(
    repositories: ReadonlyArray<Repository>
  ): Promise<void> {
    return this.appStore._installLFSHooks(repositories)
  }

  /** Change the selected Clone Repository tab. */
  public changeCloneRepositoriesTab(tab: CloneRepositoryTab): Promise<void> {
    return this.appStore._changeCloneRepositoriesTab(tab)
  }

  /**
   * Request a refresh of the list of repositories that
   * the provided account has explicit permissions to access.
   * See ApiRepositoriesStore for more details.
   */
  public refreshApiRepositories(account: Account) {
    return this.appStore._refreshApiRepositories(account)
  }

  /** Change the selected Branches foldout tab. */
  public changeBranchesTab(tab: BranchesTab): Promise<void> {
    return this.appStore._changeBranchesTab(tab)
  }

  /**
   * Open the Explore page at the GitHub instance of this repository
   */
  public showGitHubExplore(repository: Repository): Promise<void> {
    return this.appStore._showGitHubExplore(repository)
  }

  /**
   * Open the Create Pull Request page on GitHub after verifying ahead/behind.
   *
   * Note that this method will present the user with a dialog in case the
   * current branch in the repository is ahead or behind the remote.
   * The dialog lets the user choose whether get in sync with the remote
   * or open the PR anyway. This is distinct from the
   * openCreatePullRequestInBrowser method which immediately opens the
   * create pull request page without showing a dialog.
   */
  public createPullRequest(
    repository: Repository,
    baseBranch?: Branch
  ): Promise<void> {
    return this.appStore._createPullRequest(repository, baseBranch)
  }

  /**
   * Show the current pull request on github.com
   */
  public showPullRequest(repository: Repository): Promise<void> {
    return this.appStore._showPullRequest(repository)
  }

  /**
   * Open a browser and navigate to the provided pull request
   */
  public async showPullRequestByPR(pr: PullRequest): Promise<void> {
    return this.appStore._showPullRequestByPR(pr)
  }

  /**
   * Immediately open the Create Pull Request page on GitHub.
   *
   * See the createPullRequest method for more details.
   */
  public openCreatePullRequestInBrowser(
    repository: Repository,
    branch: Branch
  ): Promise<void> {
    return this.appStore._openCreatePullRequestInBrowser(repository, branch)
  }

  /**
   * Update the existing `upstream` remote to point to the repository's parent.
   */
  public updateExistingUpstreamRemote(repository: Repository): Promise<void> {
    return this.appStore._updateExistingUpstreamRemote(repository)
  }

  /** Ignore the existing `upstream` remote. */
  public ignoreExistingUpstreamRemote(repository: Repository): Promise<void> {
    return this.appStore._ignoreExistingUpstreamRemote(repository)
  }

  /** Checks out a PR whose ref exists locally or in a forked repo. */
  public async checkoutPullRequest(
    repository: RepositoryWithGitHubRepository,
    pullRequest: PullRequest
  ): Promise<void> {
    if (pullRequest.head.gitHubRepository.cloneURL === null) {
      return
    }

    return this.appStore._checkoutPullRequest(
      repository,
      pullRequest.pullRequestNumber,
      pullRequest.head.gitHubRepository.owner.login,
      pullRequest.head.gitHubRepository.cloneURL,
      pullRequest.head.ref
    )
  }

  /**
   * Set whether the user has chosen to hide or show the
   * co-authors field in the commit message component
   *
   * @param repository Co-author settings are per-repository
   */
  public setShowCoAuthoredBy(
    repository: Repository,
    showCoAuthoredBy: boolean
  ) {
    return this.appStore._setShowCoAuthoredBy(repository, showCoAuthoredBy)
  }

  /**
   * Update the per-repository co-authors list
   *
   * @param repository Co-author settings are per-repository
   * @param coAuthors  Zero or more authors
   */
  public setCoAuthors(
    repository: Repository,
    coAuthors: ReadonlyArray<Author>
  ) {
    return this.appStore._setCoAuthors(repository, coAuthors)
  }

  /**
   * Initialize the compare state for the current repository.
   */
  public initializeCompare(
    repository: Repository,
    initialAction?: CompareAction
  ) {
    return this.appStore._initializeCompare(repository, initialAction)
  }

  /**
   * Update the compare state for the current repository
   */
  public executeCompare(repository: Repository, action: CompareAction) {
    return this.appStore._executeCompare(repository, action)
  }

  /** Update the compare form state for the current repository */
  public updateCompareForm<K extends keyof ICompareFormUpdate>(
    repository: Repository,
    newState: Pick<ICompareFormUpdate, K>
  ) {
    return this.appStore._updateCompareForm(repository, newState)
  }

  /**
   *  update the manual resolution method for a file
   */
  public updateManualConflictResolution(
    repository: Repository,
    path: string,
    manualResolution: ManualConflictResolution | null
  ) {
    return this.appStore._updateManualConflictResolution(
      repository,
      path,
      manualResolution
    )
  }

  public async confirmOrForcePush(repository: Repository) {
    const { askForConfirmationOnForcePush } = this.appStore.getState()

    const { branchesState } = this.repositoryStateManager.get(repository)
    const { tip } = branchesState

    if (tip.kind !== TipState.Valid) {
      log.warn(`Could not find a branch to perform force push`)
      return
    }

    const { upstream } = tip.branch

    if (upstream === null) {
      log.warn(`Could not find an upstream branch which will be pushed`)
      return
    }

    if (askForConfirmationOnForcePush) {
      this.showPopup({
        type: PopupType.ConfirmForcePush,
        repository,
        upstreamBranch: upstream,
      })
    } else {
      await this.performForcePush(repository)
    }
  }

  public async performForcePush(repository: Repository) {
    await this.pushWithOptions(repository, {
      forceWithLease: true,
    })

    await this.appStore._loadStatus(repository)
  }

  public setConfirmDiscardStashSetting(value: boolean) {
    return this.appStore._setConfirmDiscardStashSetting(value)
  }

  public setConfirmCheckoutCommitSetting(value: boolean) {
    return this.appStore._setConfirmCheckoutCommitSetting(value)
  }

  public setConfirmForcePushSetting(value: boolean) {
    return this.appStore._setConfirmForcePushSetting(value)
  }

  public setConfirmUndoCommitSetting(value: boolean) {
    return this.appStore._setConfirmUndoCommitSetting(value)
  }

  /**
   * Converts a local repository to use the given fork
   * as its default remote and associated `GitHubRepository`.
   */
  public async convertRepositoryToFork(
    repository: RepositoryWithGitHubRepository,
    fork: IAPIFullRepository
  ): Promise<Repository> {
    return this.appStore._convertRepositoryToFork(repository, fork)
  }

  /**
   * Increments the `mergeIntoCurrentBranchMenuCount` metric
   */
  public recordMenuInitiatedMerge(isSquash: boolean = true) {
    return this.statsStore.recordMenuInitiatedMerge(isSquash)
  }

  /**
   * Set the application-wide theme
   */
  public setSelectedTheme(theme: ApplicationTheme) {
    return this.appStore._setSelectedTheme(theme)
  }

  /**
   * Set the application-wide tab size
   */
  public setSelectedTabSize(tabSize: number) {
    return this.appStore._setSelectedTabSize(tabSize)
  }

  /**
   * Increments either the `repoWithIndicatorClicked` or
   * the `repoWithoutIndicatorClicked` metric
   */
  public recordRepoClicked(repoHasIndicator: boolean) {
    return this.statsStore.recordRepoClicked(repoHasIndicator)
  }

  public recordWelcomeWizardInitiated() {
    return this.statsStore.recordWelcomeWizardInitiated()
  }

  public recordCreateRepository() {
    this.statsStore.recordCreateRepository()
  }

  public recordAddExistingRepository() {
    this.statsStore.recordAddExistingRepository()
  }

  // TODO: more rebase-related actions

  /**
   * Refresh the list of open pull requests for the given repository.
   */
  public refreshPullRequests(repository: Repository): Promise<void> {
    return this.appStore._refreshPullRequests(repository)
  }

  /**
   * Attempt to retrieve a commit status for a particular
   * ref. If the ref doesn't exist in the cache this function returns null.
   *
   * Useful for component who wish to have a value for the initial render
   * instead of waiting for the subscription to produce an event.
   */
  public tryGetCommitStatus(
    repository: GitHubRepository,
    ref: string,
    branchName?: string
  ): ICombinedRefCheck | null {
    return this.commitStatusStore.tryGetStatus(repository, ref, branchName)
  }

  /**
   * Subscribe to commit status updates for a particular ref.
   *
   * @param repository The GitHub repository to use when looking up commit status.
   * @param ref        The commit ref (can be a SHA or a Git ref) for which to
   *                   fetch status.
   * @param callback   A callback which will be invoked whenever the
   *                   store updates a commit status for the given ref.
   * @param branchName If we want to retrieve action workflow checks with the
   *                   sub, we provide the branch name for it.
   */
  public subscribeToCommitStatus(
    repository: GitHubRepository,
    ref: string,
    callback: StatusCallBack,
    branchName?: string
  ): DisposableLike {
    return this.commitStatusStore.subscribe(
      repository,
      ref,
      callback,
      branchName
    )
  }

  /**
   * Invoke a manual refresh of the status for a particular ref
   */
  public manualRefreshSubscription(
    repository: GitHubRepository,
    ref: string,
    pendingChecks: ReadonlyArray<IRefCheck>
  ): Promise<void> {
    return this.commitStatusStore.manualRefreshSubscription(
      repository,
      ref,
      pendingChecks
    )
  }

  /**
   * Triggers GitHub to rerequest a list of check suites, without pushing new
   * code to a repository.
   */
  public async rerequestCheckSuites(
    repository: GitHubRepository,
    checkRuns: ReadonlyArray<IRefCheck>,
    failedOnly: boolean
  ): Promise<ReadonlyArray<boolean>> {
    const promises = new Array<Promise<boolean>>()

    // If it is one and in actions check, we can rerun it individually.
    if (checkRuns.length === 1 && checkRuns[0].actionsWorkflow !== undefined) {
      promises.push(
        this.commitStatusStore.rerunJob(repository, checkRuns[0].id)
      )
      return Promise.all(promises)
    }

    const checkSuiteIds = new Set<number>()
    const workflowRunIds = new Set<number>()
    for (const cr of checkRuns) {
      if (failedOnly && cr.actionsWorkflow !== undefined) {
        workflowRunIds.add(cr.actionsWorkflow.id)
        continue
      }

      // There could still be failed ones that are not action and only way to
      // rerun them is to rerun their whole check suite
      if (cr.checkSuiteId !== null) {
        checkSuiteIds.add(cr.checkSuiteId)
      }
    }

    for (const id of workflowRunIds) {
      promises.push(this.commitStatusStore.rerunFailedJobs(repository, id))
    }

    for (const id of checkSuiteIds) {
      promises.push(this.commitStatusStore.rerequestCheckSuite(repository, id))
    }

    return Promise.all(promises)
  }

  /**
   * Gets a single check suite using its id
   */
  public async fetchCheckSuite(
    repository: GitHubRepository,
    checkSuiteId: number
  ): Promise<IAPICheckSuite | null> {
    return this.commitStatusStore.fetchCheckSuite(repository, checkSuiteId)
  }

  /**
   * Creates a stash for the current branch. Note that this will
   * override any stash that already exists for the current branch.
   *
   * @param repository
   * @param showConfirmationDialog  Whether to show a confirmation dialog if an
   *                                existing stash exists (defaults to true).
   */
  public createStashForCurrentBranch(
    repository: Repository,
    showConfirmationDialog: boolean = true
  ) {
    return this.appStore._createStashForCurrentBranch(
      repository,
      showConfirmationDialog
    )
  }

  /** Drops the given stash in the given repository */
  public dropStash(repository: Repository, stashEntry: IStashEntry) {
    return this.appStore._dropStashEntry(repository, stashEntry)
  }

  /** Pop the given stash in the given repository */
  public popStash(repository: Repository, stashEntry: IStashEntry) {
    return this.appStore._popStashEntry(repository, stashEntry)
  }

  /**
   * Set the width of the commit summary column in the
   * history view to the given value.
   */
  public setStashedFilesWidth = (width: number): Promise<void> => {
    return this.appStore._setStashedFilesWidth(width)
  }

  /**
   * Reset the width of the commit summary column in the
   * history view to its default value.
   */
  public resetStashedFilesWidth = (): Promise<void> => {
    return this.appStore._resetStashedFilesWidth()
  }

  /** Hide the diff for stashed changes */
  public hideStashedChanges(repository: Repository) {
    return this.appStore._hideStashedChanges(repository)
  }

  /** Call when the user opts to skip the pick editor step of the onboarding tutorial */
  public skipPickEditorTutorialStep(repository: Repository) {
    return this.appStore._skipPickEditorTutorialStep(repository)
  }

  /**
   * Call when the user has either created a pull request or opts to
   * skip the create pull request step of the onboarding tutorial
   */
  public markPullRequestTutorialStepAsComplete(repository: Repository) {
    return this.appStore._markPullRequestTutorialStepAsComplete(repository)
  }

  public markTutorialCompletionAsAnnounced(repository: Repository) {
    return this.appStore._markTutorialCompletionAsAnnounced(repository)
  }

  /**
   * Create a tutorial repository using the given account. The account
   * determines which host (i.e. GitHub.com or a GHES instance) that
   * the tutorial repository should be created on.
   *
   * @param account The account (and thereby the GitHub host) under
   *                which the repository is to be created created
   */
  public createTutorialRepository(account: Account) {
    return this.appStore._createTutorialRepository(account)
  }

  /** Open the issue creation page for a GitHub repository in a browser */
  public async openIssueCreationPage(repository: Repository): Promise<boolean> {
    // Default to creating issue on parent repo
    // See https://github.com/desktop/desktop/issues/9232 for rationale
    const url = getGitHubHtmlUrl(repository)
    if (url !== null) {
      this.statsStore.increment('issueCreationWebpageOpenedCount')
      return this.appStore._openInBrowser(`${url}/issues/new/choose`)
    } else {
      return false
    }
  }

  public setRepositoryIndicatorsEnabled(repositoryIndicatorsEnabled: boolean) {
    this.appStore._setRepositoryIndicatorsEnabled(repositoryIndicatorsEnabled)
  }

  public setCommitSpellcheckEnabled(commitSpellcheckEnabled: boolean) {
    this.appStore._setCommitSpellcheckEnabled(commitSpellcheckEnabled)
  }

  public setUseWindowsOpenSSH(useWindowsOpenSSH: boolean) {
    this.appStore._setUseWindowsOpenSSH(useWindowsOpenSSH)
  }

  public setShowCommitLengthWarning(showCommitLengthWarning: boolean) {
    this.appStore._setShowCommitLengthWarning(showCommitLengthWarning)
  }

  public setNotificationsEnabled(notificationsEnabled: boolean) {
    this.appStore._setNotificationsEnabled(notificationsEnabled)
  }

  private logHowToRevertCherryPick(
    targetBranchName: string,
    beforeSha: string | null
  ) {
    log.info(
      `[cherryPick] starting cherry-pick for ${targetBranchName} at ${beforeSha}`
    )
    log.info(
      `[cherryPick] to restore the previous state if this completed cherry-pick is unsatisfactory:`
    )
    log.info(`[cherryPick] - git checkout ${targetBranchName}`)
    log.info(`[cherryPick] - git reset ${beforeSha} --hard`)
  }

  /** Initializes multi commit operation state for cherry pick if it is null */
  public initializeMultiCommitOperationStateCherryPick(
    repository: Repository,
    targetBranch: Branch,
    commits: ReadonlyArray<CommitOneLine>,
    sourceBranch: Branch | null
  ): void {
    if (
      this.repositoryStateManager.get(repository).multiCommitOperationState !==
      null
    ) {
      return
    }

    this.initializeMultiCommitOperation(
      repository,
      {
        kind: MultiCommitOperationKind.CherryPick,
        sourceBranch,
        branchCreated: false,
        commits,
      },
      targetBranch,
      commits,
      sourceBranch?.tip.sha ?? null
    )
  }

  /** Starts a cherry pick of the given commits onto the target branch */
  public async cherryPick(
    repository: Repository,
    targetBranch: Branch,
    commits: ReadonlyArray<CommitOneLine>,
    sourceBranch: Branch | null
  ): Promise<void> {
    // If uncommitted changes are stashed, we had to clear the multi commit
    // operation in case user hit cancel. (This method only sets it, if it null)
    this.initializeMultiCommitOperationStateCherryPick(
      repository,
      targetBranch,
      commits,
      sourceBranch
    )

    this.appStore._initializeCherryPickProgress(repository, commits)
    this.switchMultiCommitOperationToShowProgress(repository)

    const retry: RetryAction = {
      type: RetryActionType.CherryPick,
      repository,
      targetBranch,
      commits,
      sourceBranch,
    }

    if (this.appStore._checkForUncommittedChanges(repository, retry)) {
      this.endMultiCommitOperation(repository)
      return
    }

    const { tip } = targetBranch
    this.repositoryStateManager.updateMultiCommitOperationUndoState(
      repository,
      () => ({
        undoSha: tip.sha,
        branchName: targetBranch.name,
      })
    )

    if (commits.length > 1) {
      this.statsStore.increment('cherryPickMultipleCommitsCount')
    }

    const nameAfterCheckout = await this.appStore._checkoutBranchReturnName(
      repository,
      targetBranch
    )

    if (nameAfterCheckout === undefined) {
      log.error('[cherryPick] - Failed to check out the target branch.')
      this.endMultiCommitOperation(repository)
      return
    }

    const result = await this.appStore._cherryPick(repository, commits)

    if (result !== CherryPickResult.UnableToStart) {
      this.logHowToRevertCherryPick(nameAfterCheckout, tip.sha)
    }

    this.processCherryPickResult(
      repository,
      result,
      nameAfterCheckout,
      commits,
      sourceBranch
    )
  }

  public async startCherryPickWithBranchName(
    repository: Repository,
    targetBranchName: string,
    startPoint: string | null,
    noTrackOption: boolean = false,
    commits: ReadonlyArray<CommitOneLine>,
    sourceBranch: Branch | null
  ): Promise<void> {
    const retry: RetryAction = {
      type: RetryActionType.CreateBranchForCherryPick,
      repository,
      targetBranchName,
      startPoint,
      noTrackOption,
      commits,
      sourceBranch,
    }

    if (this.appStore._checkForUncommittedChanges(repository, retry)) {
      this.endMultiCommitOperation(repository)
      return
    }

    const targetBranch = await this.appStore._createBranch(
      repository,
      targetBranchName,
      startPoint,
      noTrackOption,
      false
    )

    if (targetBranch === undefined) {
      log.error(
        '[startCherryPickWithBranchName] - Unable to create branch for cherry-pick operation'
      )
      this.endMultiCommitOperation(repository)
      return
    }

    // If uncommitted changes are stashed, we had to clear the multi commit
    // operation in case user hit cancel. (This method only sets it, if it null)
    this.initializeMultiCommitOperationStateCherryPick(
      repository,
      targetBranch,
      commits,
      sourceBranch
    )
    this.appStore._setMultiCommitOperationTargetBranch(repository, targetBranch)
    this.appStore._setCherryPickBranchCreated(repository, true)
    this.statsStore.increment('cherryPickBranchCreatedCount')
    return this.cherryPick(repository, targetBranch, commits, sourceBranch)
  }

  /**
   * This method starts a cherry pick after drag and dropping on a branch.
   * It needs to:
   *  - get the current branch,
   *  - get the commits dragged from cherry picking state
   *  - invoke popup
   *  - invoke cherry pick
   */
  public async startCherryPickWithBranch(
    repository: Repository,
    targetBranch: Branch
  ): Promise<void> {
    const { branchesState } = this.repositoryStateManager.get(repository)

    const { dragData } = dragAndDropManager
    if (dragData == null || dragData.type !== DragType.Commit) {
      log.error(
        '[cherryPick] Invalid Cherry-picking State: Could not determine selected commits.'
      )
      this.endMultiCommitOperation(repository)
      return
    }

    const { tip } = branchesState
    if (tip.kind !== TipState.Valid) {
      this.endMultiCommitOperation(repository)
      throw new Error(
        'Tip is not in a valid state, which is required to start the cherry-pick flow.'
      )
    }
    const sourceBranch = tip.branch
    const { commits } = dragData

    this.initializeMultiCommitOperation(
      repository,
      {
        kind: MultiCommitOperationKind.CherryPick,
        sourceBranch,
        branchCreated: false,
        commits,
      },
      targetBranch,
      commits,
      tip.branch.tip.sha
    )

    this.showPopup({
      type: PopupType.MultiCommitOperation,
      repository,
    })

    this.statsStore.increment('cherryPickViaDragAndDropCount')
    this.setCherryPickBranchCreated(repository, false)
    this.cherryPick(repository, targetBranch, commits, sourceBranch)
  }

  /**
   * Method to start a cherry-pick after drag and dropping onto a pull request.
   */
  public async startCherryPickWithPullRequest(
    repository: RepositoryWithGitHubRepository,
    pullRequest: PullRequest
  ) {
    const { pullRequestNumber, head } = pullRequest
    const { ref, gitHubRepository } = head
    const {
      cloneURL,
      owner: { login },
    } = gitHubRepository

    let targetBranch
    if (cloneURL !== null) {
      targetBranch = await this.appStore._findPullRequestBranch(
        repository,
        pullRequestNumber,
        login,
        cloneURL,
        ref
      )
    }

    if (targetBranch === undefined) {
      log.error(
        '[cherryPick] Could not determine target branch for cherry-pick operation - aborting cherry-pick.'
      )
      this.endMultiCommitOperation(repository)
      return
    }

    return this.startCherryPickWithBranch(repository, targetBranch)
  }

  /**
   * Continue with the cherryPick after the user has resolved all conflicts with
   * tracked files in the working directory.
   */
  public async continueCherryPick(
    repository: Repository,
    files: ReadonlyArray<WorkingDirectoryFileChange>,
    conflictsState: CherryPickConflictState,
    commits: ReadonlyArray<CommitOneLine>,
    sourceBranch: Branch | null
  ): Promise<void> {
    await this.switchMultiCommitOperationToShowProgress(repository)

    const result = await this.appStore._continueCherryPick(
      repository,
      files,
      conflictsState.manualResolutions
    )

    if (result === CherryPickResult.CompletedWithoutError) {
      this.statsStore.increment('cherryPickSuccessfulWithConflictsCount')
    }

    this.processCherryPickResult(
      repository,
      result,
      conflictsState.targetBranchName,
      commits,
      sourceBranch
    )
  }

  /**
   * Obtains the current app conflict state and switches cherry pick flow to
   * show conflicts step
   */
  private startConflictCherryPickFlow(repository: Repository): void {
    const { changesState, multiCommitOperationState } =
      this.repositoryStateManager.get(repository)
    const { conflictState } = changesState

    if (
      conflictState === null ||
      !isCherryPickConflictState(conflictState) ||
      multiCommitOperationState == null ||
      multiCommitOperationState.operationDetail.kind !==
        MultiCommitOperationKind.CherryPick
    ) {
      log.error(
        '[cherryPick] - conflict state was null or not in a cherry-pick conflict state - unable to continue'
      )
      this.endMultiCommitOperation(repository)
      return
    }

    const { sourceBranch } = multiCommitOperationState.operationDetail

    this.setMultiCommitOperationStep(repository, {
      kind: MultiCommitOperationStepKind.ShowConflicts,
      conflictState: {
        kind: 'multiCommitOperation',
        manualResolutions: conflictState.manualResolutions,
        ourBranch: conflictState.targetBranchName,
        theirBranch: sourceBranch !== null ? sourceBranch.name : undefined,
      },
    })

    this.statsStore.increment('cherryPickConflictsEncounteredCount')
  }

  /** Aborts an ongoing cherry pick and switches back to the source branch. */
  public async abortCherryPick(
    repository: Repository,
    sourceBranch: Branch | null
  ) {
    await this.appStore._abortCherryPick(repository, sourceBranch)
    await this.appStore._loadStatus(repository)
    this.endMultiCommitOperation(repository)
    await this.refreshRepository(repository)
  }

  /**
   * Moves multi commit operation step to progress and defers to allow user to
   * see the progress dialog instead of suddenly appearing
   * and disappearing again.
   */
  public async switchMultiCommitOperationToShowProgress(
    repository: Repository
  ) {
    this.setMultiCommitOperationStep(repository, {
      kind: MultiCommitOperationStepKind.ShowProgress,
    })
    await sleep(500)
  }

  /**
   * Processes the cherry pick result.
   *  1. Completes the cherry pick with banner if successful.
   *  2. Moves cherry pick flow if conflicts.
   *  3. Handles errors.
   */
  private async processCherryPickResult(
    repository: Repository,
    cherryPickResult: CherryPickResult,
    targetBranchName: string,
    commits: ReadonlyArray<CommitOneLine>,
    sourceBranch: Branch | null
  ): Promise<void> {
    // This will update the conflict state of the app. This is needed to start
    // conflict flow if cherry pick results in conflict.
    await this.appStore._loadStatus(repository)

    switch (cherryPickResult) {
      case CherryPickResult.CompletedWithoutError:
        await this.changeCommitSelection(repository, [commits[0].sha], true)
        await this.completeMultiCommitOperation(repository, commits.length)
        break
      case CherryPickResult.ConflictsEncountered:
        this.startConflictCherryPickFlow(repository)
        break
      case CherryPickResult.UnableToStart:
        // This is an expected error such as not being able to checkout the
        // target branch which means the cherry pick operation never started or
        // was cleanly aborted.
        this.endMultiCommitOperation(repository)
        break
      default:
        // If the user closes error dialog and tries to cherry pick again, it
        // will fail again due to ongoing cherry pick. Thus, if we get to an
        // unhandled error state, we want to abort any ongoing cherry pick.
        // A known error is if a user attempts to cherry pick a merge commit.
        this.appStore._clearCherryPickingHead(repository, sourceBranch)
        this.endMultiCommitOperation(repository)
        this.appStore._closePopup()
    }
  }

  /**
   * Update the cherry pick progress in application state by querying the Git
   * repository state.
   */
  public setCherryPickProgressFromState(repository: Repository) {
    return this.appStore._setCherryPickProgressFromState(repository)
  }

  /** Method to set the drag element */
  public setDragElement(dragElement: DragElement): void {
    this.appStore._setDragElement(dragElement)
  }

  /** Method to clear the drag element */
  public clearDragElement(): void {
    this.appStore._setDragElement(null)
  }

  /** Set Cherry Pick Flow Step For Create Branch */
  public async setCherryPickCreateBranchFlowStep(
    repository: Repository,
    targetBranchName: string,
    commits: ReadonlyArray<CommitOneLine>,
    sourceBranch: Branch | null
  ): Promise<void> {
    const { branchesState } = this.repositoryStateManager.get(repository)
    const { defaultBranch, upstreamDefaultBranch, allBranches, tip } =
      branchesState

    if (tip.kind !== TipState.Valid) {
      this.appStore._clearCherryPickingHead(repository, null)
      this.endMultiCommitOperation(repository)
      log.error('Tip is in unknown state. Cherry-pick aborted.')
      return
    }

    const isGHRepo = isRepositoryWithGitHubRepository(repository)
    const upstreamGhRepo = isGHRepo
      ? getNonForkGitHubRepository(repository as RepositoryWithGitHubRepository)
      : null

    this.initializeMultiCommitOperation(
      repository,
      {
        kind: MultiCommitOperationKind.CherryPick,
        sourceBranch,
        branchCreated: true,
        commits,
      },
      null,
      commits,
      tip.branch.tip.sha
    )

    const step: CreateBranchStep = {
      kind: MultiCommitOperationStepKind.CreateBranch,
      allBranches,
      defaultBranch,
      upstreamDefaultBranch,
      upstreamGhRepo,
      tip,
      targetBranchName,
    }

    return this.appStore._setMultiCommitOperationStep(repository, step)
  }

  /** Set the multi commit operation target branch */
  public setMultiCommitOperationTargetBranch(
    repository: Repository,
    targetBranch: Branch
  ): void {
    this.repositoryStateManager.updateMultiCommitOperationState(
      repository,
      () => ({
        targetBranch,
      })
    )
  }

  /** Set cherry-pick branch created state */
  public setCherryPickBranchCreated(
    repository: Repository,
    branchCreated: boolean
  ): void {
    this.appStore._setCherryPickBranchCreated(repository, branchCreated)
  }

  /** Gets a branches ahead behind remote or null if doesn't exist on remote */
  public async getBranchAheadBehind(
    repository: Repository,
    branch: Branch
  ): Promise<IAheadBehind | null> {
    return this.appStore._getBranchAheadBehind(repository, branch)
  }

  /** Set whether thank you is in order for external contributions */
  public setLastThankYou(lastThankYou: ILastThankYou) {
    this.appStore._setLastThankYou(lastThankYou)
  }

  /** Set whether or not the user wants to use a custom external editor */
  public setUseCustomEditor(useCustomEditor: boolean) {
    this.appStore._setUseCustomEditor(useCustomEditor)
  }

  /** Set the custom external editor info */
  public setCustomEditor(customEditor: ICustomIntegration) {
    this.appStore._setCustomEditor(customEditor)
  }

  /** Set whether or not the user wants to use a custom shell */
  public setUseCustomShell(useCustomShell: boolean) {
    this.appStore._setUseCustomShell(useCustomShell)
  }

  /** Set the custom shell info */
  public setCustomShell(customShell: ICustomIntegration) {
    this.appStore._setCustomShell(customShell)
  }

  public async reorderCommits(
    repository: Repository,
    commitsToReorder: ReadonlyArray<Commit>,
    beforeCommit: Commit | null,
    lastRetainedCommitRef: string | null,
    continueWithForcePush: boolean = false
  ) {
    const retry: RetryAction = {
      type: RetryActionType.Reorder,
      repository,
      commitsToReorder,
      beforeCommit,
      lastRetainedCommitRef,
    }

    if (this.appStore._checkForUncommittedChanges(repository, retry)) {
      return
    }

    const stateBefore = this.repositoryStateManager.get(repository)
    const { tip } = stateBefore.branchesState

    if (tip.kind !== TipState.Valid) {
      log.info(`[reorder] - invalid tip state - could not perform reorder.`)
      return
    }

    this.statsStore.increment('reorderStartedCount')

    if (commitsToReorder.length > 1) {
      this.statsStore.increment('reorderMultipleCommitsCount')
    }

    this.appStore._initializeMultiCommitOperation(
      repository,
      {
        kind: MultiCommitOperationKind.Reorder,
        lastRetainedCommitRef,
        beforeCommit,
        commits: commitsToReorder,
        currentTip: tip.branch.tip.sha,
      },
      tip.branch,
      commitsToReorder,
      tip.branch.tip.sha
    )

    this.showPopup({
      type: PopupType.MultiCommitOperation,
      repository,
    })

    this.appStore._setMultiCommitOperationUndoState(repository, tip)

    const { askForConfirmationOnForcePush } = this.appStore.getState()

    if (askForConfirmationOnForcePush && !continueWithForcePush) {
      const showWarning = await this.warnAboutRemoteCommits(
        repository,
        tip.branch,
        lastRetainedCommitRef
      )

      if (showWarning) {
        this.setMultiCommitOperationStep(repository, {
          kind: MultiCommitOperationStepKind.WarnForcePush,
          targetBranch: tip.branch,
          baseBranch: tip.branch,
          commits: commitsToReorder,
        })
        return
      }
    }

    const result = await this.appStore._reorderCommits(
      repository,
      commitsToReorder,
      beforeCommit,
      lastRetainedCommitRef
    )

    this.logHowToRevertMultiCommitOperation(
      MultiCommitOperationKind.Reorder,
      tip
    )

    return this.processMultiCommitOperationRebaseResult(
      MultiCommitOperationKind.Reorder,
      repository,
      result,
      commitsToReorder.length,
      tip.branch.name,
      `${MultiCommitOperationKind.Reorder.toLowerCase()} commit`
    )
  }

  /**
   * Starts a squash
   *
   * @param toSquash - commits to squash onto another commit
   * @param squashOnto  - commit to squash the `toSquash` commits onto
   * @param lastRetainedCommitRef - commit ref of commit before commits in
   * squash or null if a commit to squash is root (first in history) of the
   * branch
   * @param commitContext - to build the commit message from
   */
  public async squash(
    repository: Repository,
    toSquash: ReadonlyArray<Commit>,
    squashOnto: Commit,
    lastRetainedCommitRef: string | null,
    commitContext: ICommitContext,
    continueWithForcePush: boolean = false
  ): Promise<void> {
    const retry: RetryAction = {
      type: RetryActionType.Squash,
      repository,
      toSquash,
      squashOnto,
      lastRetainedCommitRef,
      commitContext,
    }

    if (this.appStore._checkForUncommittedChanges(repository, retry)) {
      return
    }

    const stateBefore = this.repositoryStateManager.get(repository)
    const { tip } = stateBefore.branchesState

    if (tip.kind !== TipState.Valid) {
      log.info(`[squash] - invalid tip state - could not perform squash.`)
      return
    }

    if (toSquash.length > 1) {
      this.statsStore.increment('squashMultipleCommitsInvokedCount')
    }

    this.initializeMultiCommitOperation(
      repository,
      {
        kind: MultiCommitOperationKind.Squash,
        lastRetainedCommitRef,
        commitContext,
        targetCommit: squashOnto,
        commits: toSquash,
        currentTip: tip.branch.tip.sha,
      },
      tip.branch,
      toSquash,
      tip.branch.tip.sha
    )

    this.closePopup(PopupType.CommitMessage)
    this.showPopup({
      type: PopupType.MultiCommitOperation,
      repository,
    })

    this.appStore._setMultiCommitOperationUndoState(repository, tip)

    const { askForConfirmationOnForcePush } = this.appStore.getState()

    if (askForConfirmationOnForcePush && !continueWithForcePush) {
      const showWarning = await this.warnAboutRemoteCommits(
        repository,
        tip.branch,
        lastRetainedCommitRef
      )

      if (showWarning) {
        this.setMultiCommitOperationStep(repository, {
          kind: MultiCommitOperationStepKind.WarnForcePush,
          targetBranch: tip.branch,
          baseBranch: tip.branch,
          commits: toSquash,
        })
        return
      }
    }

    const result = await this.appStore._squash(
      repository,
      toSquash,
      squashOnto,
      lastRetainedCommitRef,
      commitContext
    )

    this.logHowToRevertMultiCommitOperation(
      MultiCommitOperationKind.Squash,
      tip
    )

    return this.processMultiCommitOperationRebaseResult(
      MultiCommitOperationKind.Squash,
      repository,
      result,
      toSquash.length + 1,
      tip.branch.name,
      `${MultiCommitOperationKind.Squash.toLowerCase()} commit`
    )
  }

  public initializeMultiCommitOperation(
    repository: Repository,
    operationDetail: MultiCommitOperationDetail,
    targetBranch: Branch | null,
    commits: ReadonlyArray<Commit | CommitOneLine>,
    originalBranchTip: string | null
  ) {
    this.appStore._initializeMultiCommitOperation(
      repository,
      operationDetail,
      targetBranch,
      commits,
      originalBranchTip
    )
  }

  private logHowToRevertMultiCommitOperation(
    kind: MultiCommitOperationKind,
    tip: IValidBranch
  ) {
    const operation = kind.toLocaleLowerCase()
    const beforeSha = getTipSha(tip)
    log.info(
      `[${operation}] starting rebase for ${tip.branch.name} at ${beforeSha}`
    )
    log.info(
      `[${operation}] to restore the previous state if this completed rebase is unsatisfactory:`
    )
    log.info(`[${operation}] - git checkout ${tip.branch.name}`)
    log.info(`[${operation}] - git reset ${beforeSha} --hard`)
  }

  /**
   * Processes the multi commit operation result
   *  1. Completes the operation with banner if successful.
   *  2. Moves operation flow to conflicts handler.
   *  3. Handles errors.
   *
   * @param totalNumberOfCommits  Total number of commits involved in the
   *                              operation. For example, if you squash one
   *                              commit onto another, there are 2 commits
   *                              involved.
   */
  public async processMultiCommitOperationRebaseResult(
    kind: MultiCommitOperationKind,
    repository: Repository,
    result: RebaseResult,
    totalNumberOfCommits: number,
    ourBranch: string,
    theirBranch: string
  ): Promise<void> {
    // This will update the conflict state of the app. This is needed to start
    // conflict flow if squash results in conflict.
    const status = await this.appStore._loadStatus(repository)
    switch (result) {
      case RebaseResult.AlreadyUpToDate:
        sendNonFatalException(
          'rebaseConflictsWithBranchAlreadyUpToDate',
          new Error(
            `processMultiCommitOperationRebaseResult was invoked (which means Desktop went into a conflicts-found state) but the branch was already up-to-date, so there couldn't be any conflicts at all`
          )
        )
        break
      case RebaseResult.CompletedWithoutError:
        if (status !== null && status.currentTip !== undefined) {
          // This sets the history to the current tip
          // TODO: Look at history back to last retained commit and search for
          // squashed commit based on new commit message ... if there is more
          // than one, just take the most recent. (not likely?)
          await this.changeCommitSelection(
            repository,
            [status.currentTip],
            true
          )
        }

        await this.completeMultiCommitOperation(
          repository,
          totalNumberOfCommits
        )
        break
      case RebaseResult.ConflictsEncountered:
        await this.refreshRepository(repository)
        this.startMultiCommitOperationConflictFlow(
          kind,
          repository,
          ourBranch,
          theirBranch
        )
        break
      default:
        // TODO: clear state
        this.appStore._closePopup()
    }
  }

  /**
   * Obtains the current app conflict state and switches multi commit operation
   * to show conflicts step
   */
  private startMultiCommitOperationConflictFlow(
    kind: MultiCommitOperationKind,
    repository: Repository,
    ourBranch: string,
    theirBranch: string
  ): void {
    const {
      changesState: { conflictState },
    } = this.repositoryStateManager.get(repository)

    if (conflictState === null) {
      log.error(
        '[startMultiCommitOperationConflictFlow] - conflict state was null - unable to continue'
      )
      this.endMultiCommitOperation(repository)
      return
    }

    const { manualResolutions } = conflictState
    this.setMultiCommitOperationStep(repository, {
      kind: MultiCommitOperationStepKind.ShowConflicts,
      conflictState: {
        kind: 'multiCommitOperation',
        manualResolutions,
        ourBranch,
        theirBranch,
      },
    })

    this.statsStore.recordOperationConflictsEncounteredCount(kind)

    this.showPopup({
      type: PopupType.MultiCommitOperation,
      repository,
    })
  }

  /**
   * Wrap multi commit operation actions
   * - closes popups
   * - refreshes repo (so changes appear in history)
   * - sets success banner
   * - end operation state
   */
  private async completeMultiCommitOperation(
    repository: Repository,
    count: number
  ): Promise<void> {
    this.closePopup()

    const {
      branchesState: { tip },
      multiCommitOperationState: mcos,
    } = this.repositoryStateManager.get(repository)

    if (mcos === null) {
      log.error(
        '[completeMultiCommitOperation] - No multi commit operation to complete.'
      )
      return
    }

    const { operationDetail, originalBranchTip } = mcos
    const { kind } = operationDetail
    const banner = this.getMultiCommitOperationSuccessBanner(
      repository,
      count,
      mcos
    )

    this.setBanner(banner)

    if (
      tip.kind === TipState.Valid &&
      originalBranchTip !== null &&
      kind !== MultiCommitOperationKind.CherryPick
    ) {
      this.addBranchToForcePushList(repository, tip, originalBranchTip)
    }

    this.statsStore.recordOperationSuccessful(kind)

    this.endMultiCommitOperation(repository)
    await this.refreshRepository(repository)
  }

  private getMultiCommitOperationSuccessBanner(
    repository: Repository,
    count: number,
    mcos: IMultiCommitOperationState
  ): Banner {
    const { operationDetail, targetBranch } = mcos
    const { kind } = operationDetail

    const bannerBase = {
      count,
      onUndo: () => {
        this.undoMultiCommitOperation(mcos, repository, count)
      },
    }

    let banner: Banner
    switch (kind) {
      case MultiCommitOperationKind.Squash:
        banner = { ...bannerBase, type: BannerType.SuccessfulSquash }
        break
      case MultiCommitOperationKind.Reorder:
        banner = { ...bannerBase, type: BannerType.SuccessfulReorder }
        break
      case MultiCommitOperationKind.CherryPick:
        banner = {
          ...bannerBase,
          type: BannerType.SuccessfulCherryPick,
          targetBranchName: targetBranch !== null ? targetBranch.name : '',
        }
        break
      case MultiCommitOperationKind.Rebase:
        const { sourceBranch } = operationDetail
        banner = {
          type: BannerType.SuccessfulRebase,
          targetBranch: targetBranch !== null ? targetBranch.name : '',
          baseBranch: sourceBranch !== null ? sourceBranch.name : undefined,
        }
        break
      case MultiCommitOperationKind.Merge:
        throw new Error(`Unexpected multi commit operation kind ${kind}`)
      default:
        assertNever(kind, `Unsupported multi operation kind ${kind}`)
    }

    return banner
  }

  /**
   * This method will perform a hard reset back to the tip of the branch before
   * the multi commit operation happened.
   */
  private async undoMultiCommitOperation(
    mcos: IMultiCommitOperationState,
    repository: Repository,
    commitsCount: number
  ): Promise<boolean> {
    const result = await this.appStore._undoMultiCommitOperation(
      mcos,
      repository,
      commitsCount
    )

    if (result) {
      this.statsStore.recordOperationUndone(mcos.operationDetail.kind)
    }

    return result
  }

  public handleConflictsDetectedOnError(
    repository: Repository,
    currentBranch: string,
    theirBranch: string
  ) {
    return this.appStore._handleConflictsDetectedOnError(
      repository,
      currentBranch,
      theirBranch
    )
  }

  /**
   * This method is to update the multi operation state to move it along in
   * steps.
   */
  public setMultiCommitOperationStep(
    repository: Repository,
    step: MultiCommitOperationStep
  ): Promise<void> {
    return this.appStore._setMultiCommitOperationStep(repository, step)
  }

  /** Method to clear multi commit operation state. */
  public endMultiCommitOperation(repository: Repository) {
    this.appStore._endMultiCommitOperation(repository)
  }

  /** Opens conflicts found banner for part of multi commit operation */
  public onConflictsFoundBanner = (
    repository: Repository,
    operationDescription: string | JSX.Element,
    multiCommitOperationConflictState: MultiCommitOperationConflictState
  ) => {
    this.setBanner({
      type: BannerType.ConflictsFound,
      operationDescription,
      onOpenConflictsDialog: async () => {
        const { changesState, multiCommitOperationState } =
          this.repositoryStateManager.get(repository)
        const { conflictState } = changesState

        if (conflictState == null) {
          log.error(
            '[onConflictsFoundBanner] App is in invalid state to so conflicts dialog.'
          )
          return
        }

        if (
          multiCommitOperationState !== null &&
          multiCommitOperationState.operationDetail.kind ===
            MultiCommitOperationKind.CherryPick
        ) {
          // TODO: expanded to other types - not functionally necessary; makes
          // progress dialog more accurate; likely only regular rebase has the
          // state data to also do this; need to evaluate it's importance
          await this.setCherryPickProgressFromState(repository)
        }

        const { manualResolutions } = conflictState

        this.setMultiCommitOperationStep(repository, {
          kind: MultiCommitOperationStepKind.ShowConflicts,
          conflictState: {
            ...multiCommitOperationConflictState,
            manualResolutions,
          },
        })

        this.showPopup({
          type: PopupType.MultiCommitOperation,
          repository,
        })
      },
    })
  }

  public startMergeBranchOperation(
    repository: Repository,
    isSquash: boolean = false,
    initialBranch?: Branch | null
  ) {
    const { branchesState } = this.repositoryStateManager.get(repository)
    const { defaultBranch, allBranches, recentBranches, tip } = branchesState
    let currentBranch: Branch | null = null

    if (tip.kind === TipState.Valid) {
      currentBranch = tip.branch
    } else {
      throw new Error(
        'Tip is not in a valid state, which is required to start the merge operation'
      )
    }

    this.initializeMergeOperation(repository, isSquash, null)

    this.setMultiCommitOperationStep(repository, {
      kind: MultiCommitOperationStepKind.ChooseBranch,
      defaultBranch,
      currentBranch,
      allBranches,
      recentBranches,
      initialBranch: initialBranch !== null ? initialBranch : undefined,
    })

    this.showPopup({
      type: PopupType.MultiCommitOperation,
      repository,
    })
  }

  /** Records the squash that a squash has been invoked by either drag and drop or context menu */
  public recordSquashInvoked(isInvokedByContextMenu: boolean): void {
    if (isInvokedByContextMenu) {
      this.statsStore.increment('squashViaContextMenuInvokedCount')
    } else {
      this.statsStore.increment('squashViaDragAndDropInvokedCount')
    }
  }

  public initializeMergeOperation(
    repository: Repository,
    isSquash: boolean,
    sourceBranch: Branch | null
  ) {
    const {
      branchesState: { tip },
    } = this.repositoryStateManager.get(repository)

    let currentBranch: Branch | null = null

    if (tip.kind === TipState.Valid) {
      currentBranch = tip.branch
    } else {
      throw new Error(
        'Tip is not in a valid state, which is required to initialize the merge operation'
      )
    }

    this.initializeMultiCommitOperation(
      repository,
      {
        kind: MultiCommitOperationKind.Merge,
        isSquash,
        sourceBranch,
      },
      currentBranch,
      [],
      currentBranch.tip.sha
    )
  }

  public setShowCIStatusPopover(showCIStatusPopover: boolean) {
    this.appStore._setShowCIStatusPopover(showCIStatusPopover)
    if (showCIStatusPopover) {
      this.statsStore.increment('opensCheckRunsPopover')
    }
  }

  public _toggleCIStatusPopover() {
    this.appStore._toggleCIStatusPopover()
  }

  public recordPullRequestReviewDialogSwitchToPullRequest(
    reviewType: ValidNotificationPullRequestReviewState
  ) {
    this.statsStore.recordPullRequestReviewDialogSwitchToPullRequest(reviewType)
  }

  public showUnreachableCommits(selectedTab: UnreachableCommitsTab) {
    this.statsStore.increment(
      'multiCommitDiffUnreachableCommitsDialogOpenedCount'
    )

    this.showPopup({
      type: PopupType.UnreachableCommits,
      selectedTab,
    })
  }

  public startPullRequest(repository: Repository) {
    this.appStore._startPullRequest(repository)
  }

  /**
   * Change the selected changed file of the current pull request state.
   */
  public changePullRequestFileSelection(
    repository: Repository,
    file: CommittedFileChange
  ): Promise<void> {
    return this.appStore._changePullRequestFileSelection(repository, file)
  }

  /**
   * Set the width of the file list column in the pull request files changed
   */
  public setPullRequestFileListWidth(width: number): Promise<void> {
    return this.appStore._setPullRequestFileListWidth(width)
  }

  /**
   * Reset the width of the file list column in the pull request files changed
   */
  public resetPullRequestFileListWidth(): Promise<void> {
    return this.appStore._resetPullRequestFileListWidth()
  }

  public updatePullRequestBaseBranch(repository: Repository, branch: Branch) {
    this.appStore._updatePullRequestBaseBranch(repository, branch)
  }

  /**
   * Attempts to quit the app if it's not updating, unless requested to quit
   * even if it is updating.
   *
   * @param evenIfUpdating Whether to quit even if the app is updating.
   */
  public quitApp(evenIfUpdating: boolean) {
    this.appStore._quitApp(evenIfUpdating)
  }

  /**
   * Cancels quitting the app. This could be needed if, on macOS, the user tries
   * to quit the app while an update is in progress, but then after being
   * informed about the issues that could cause they decided to not close the
   * app yet.
   */
  public cancelQuittingApp() {
    this.appStore._cancelQuittingApp()
  }

  /**
   * Sets the user's preference for which pull request suggested next action to
   * use
   */
  public setPullRequestSuggestedNextAction(
    value: PullRequestSuggestedNextAction
  ) {
    return this.appStore._setPullRequestSuggestedNextAction(value)
  }

  public appFocusedElementChanged() {
    this.appStore._appFocusedElementChanged()
  }

  public updateCachedRepoRulesets(rulesets: Array<IAPIRepoRuleset | null>) {
    this.appStore._updateCachedRepoRulesets(rulesets)
  }

  public onChecksFailedNotification(
    repository: RepositoryWithGitHubRepository,
    pullRequest: PullRequest,
    checks: ReadonlyArray<IRefCheck>
  ) {
    this.appStore.onChecksFailedNotification(repository, pullRequest, checks)
  }

  public setUnderlineLinksSetting(underlineLinks: boolean) {
    return this.appStore._updateUnderlineLinks(underlineLinks)
  }

  public setDiffCheckMarksSetting(diffCheckMarks: boolean) {
    return this.appStore._updateShowDiffCheckMarks(diffCheckMarks)
  }
}
