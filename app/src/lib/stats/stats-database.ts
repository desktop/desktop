import Dexie from 'dexie'

// NB: This _must_ be incremented whenever the DB key scheme changes.
const DatabaseVersion = 2

/** The timing stats for app launch. */
export interface ILaunchStats {
  /**
   * The time (in milliseconds) it takes from when our main process code is
   * first loaded until the app `ready` event is emitted.
   */
  readonly mainReadyTime: number

  /**
   * The time (in milliseconds) it takes from when loading begins to loading
   * end.
   */
  readonly loadTime: number

  /**
   * The time (in milliseconds) it takes from when our renderer process code is
   * first loaded until the renderer `ready` event is emitted.
   */
  readonly rendererReadyTime: number
}

/** The daily measures captured for stats. */
export interface IDailyMeasures {
  /** The ID in the database. */
  readonly id?: number

  /** The number of commits. */
  readonly commits: number

  /** The number of times the user has opened a shell from the app. */
  readonly openShellCount: number

  /** The number of partial commits. */
  readonly partialCommits: number

  /** The number of commits created with one or more co-authors. */
  readonly coAuthoredCommits: number

  /** The number of times a branch is compared to an arbitrary branch */
  readonly branchComparisons: number

  /** The number of times a branch is compared to the default branch */
  readonly defaultBranchComparisons: number

  /** The number of times a merge is initiated in the `compare` sidebar */
  readonly mergesInitiatedFromComparison: number

  /** The number of times the `Branch -> Update From Default Branch` menu item is used */
  readonly updateFromDefaultBranchMenuCount: number

  /** The number of times the `Branch -> Merge Into Current Branch` menu item is used */
  readonly mergeIntoCurrentBranchMenuCount: number

  /** The number of times the user checks out a branch using the PR menu */
  readonly prBranchCheckouts: number

  /** The numbers of times a repo with indicators is clicked on repo list view */
  readonly repoWithIndicatorClicked: number

  /** The numbers of times a repo without indicators is clicked on repo list view */
  readonly repoWithoutIndicatorClicked: number

  /** The number of times the user pushes to GitHub.com */
  readonly dotcomPushCount: number

  /** The number of times the user pushes with `--force-with-lease` to GitHub.com */
  readonly dotcomForcePushCount: number

  /** The number of times the user pushed to a GitHub Enterprise instance */
  readonly enterprisePushCount: number

  /** The number of times the user pushes with `--force-with-lease` to a GitHub Enterprise instance */
  readonly enterpriseForcePushCount: number

  /** The number of times the users pushes to a generic remote */
  readonly externalPushCount: number

  /** The number of times the users pushes with `--force-with-lease` to a generic remote */
  readonly externalForcePushCount: number

  /** The number of times the user merged before seeing the result of the merge hint */
  readonly mergedWithLoadingHintCount: number

  /** The number of times the user has merged after seeing the 'no conflicts' merge hint */
  readonly mergedWithCleanMergeHintCount: number

  /** The number of times the user has merged after seeing the 'you have XX conflicted files' warning */
  readonly mergedWithConflictWarningHintCount: number

  /** Whether or not the app has been interacted with during the current reporting window */
  readonly active: boolean

  /** The number of times a `git pull` initiated by Desktop resulted in a merge conflict for the user */
  readonly mergeConflictFromPullCount: number

  /** The number of times a `git merge` initiated by Desktop resulted in a merge conflict for the user */
  readonly mergeConflictFromExplicitMergeCount: number

  /** The number of times a conflicted merge was successfully completed by the user */
  readonly mergeSuccessAfterConflictsCount: number

  /** The number of times a conflicted merge was aborted by the user */
  readonly mergeAbortedAfterConflictsCount: number

  /** The number of commits that will go unattributed to GitHub users */
  readonly unattributedCommits: number

  /**
   * The number of times the user made a commit to a repo hosted on
   * a GitHub Enterprise instance
   */
  readonly enterpriseCommits: number

  /** The number of times the user made a commit to a repo hosted on Github.com */
  readonly dotcomCommits: number

  /** The number of times the user made a commit to a protected GitHub or GitHub Enterprise repository */
  readonly commitsToProtectedBranch: number

  /** The number of times the user made a commit to a repository with branch protections enabled */
  readonly commitsToRepositoryWithBranchProtections: number

  /** The number of times the user dismissed the merge conflicts dialog */
  readonly mergeConflictsDialogDismissalCount: number

  /** The number of times the user dismissed the merge conflicts dialog with conflicts left */
  readonly anyConflictsLeftOnMergeConflictsDialogDismissalCount: number

  /** The number of times the user reopened the merge conflicts dialog (after closing it) */
  readonly mergeConflictsDialogReopenedCount: number

  /** The number of times the user committed a conflicted merge via the merge conflicts dialog */
  readonly guidedConflictedMergeCompletionCount: number

  /** The number of times the user committed a conflicted merge outside the merge conflicts dialog */
  readonly unguidedConflictedMergeCompletionCount: number

  /** The number of times the user is taken to the create pull request page on dotcom */
  readonly createPullRequestCount: number

  /** The number of times the rebase conflicts dialog is dismissed */
  readonly rebaseConflictsDialogDismissalCount: number

  /** The number of times the rebase conflicts dialog is reopened */
  readonly rebaseConflictsDialogReopenedCount: number

  /** The number of times an aborted rebase is detected */
  readonly rebaseAbortedAfterConflictsCount: number

  /** The number of times a successful rebase after handling conflicts is detected */
  readonly rebaseSuccessAfterConflictsCount: number

  /** The number of times a successful rebase without conflicts is detected */
  readonly rebaseSuccessWithoutConflictsCount: number

  /** The number of times a user performed a pull with `pull.rebase` in config set to `true` */
  readonly pullWithRebaseCount: number

  /** The number of times a user has pulled with `pull.rebase` unset or set to `false` */
  readonly pullWithDefaultSettingCount: number

  /**
   * The number of stash entries created outside of Desktop
   * in a given 24 hour day
   */
  readonly stashEntriesCreatedOutsideDesktop: number

  /**
   * The number of times the user is presented with the error
   * message "Some of your changes would be overwritten"
   */
  readonly errorWhenSwitchingBranchesWithUncommmittedChanges: number

  /** The number of times the user opens the "Rebase current branch" menu item */
  readonly rebaseCurrentBranchMenuCount: number

  /** The number of times the user views a stash entry after checking out a branch */
  readonly stashViewedAfterCheckoutCount: number

  /** The number of times the user **doesn't** view a stash entry after checking out a branch */
  readonly stashNotViewedAfterCheckoutCount: number

  /** The number of times the user elects to stash changes on the current branch  */
  readonly stashCreatedOnCurrentBranchCount: number

  /** The number of times the user elects to take changes to new branch instead of stashing them */
  readonly changesTakenToNewBranchCount: number

  /** The number of times the user elects to restore an entry from their stash */
  readonly stashRestoreCount: number

  /** The number of times the user elects to discard a stash entry */
  readonly stashDiscardCount: number

  /**
   * The number of times the user views the stash entry as a result
   * of clicking the "Stashed changes" row directly
   */
  readonly stashViewCount: number

  /** The number of times the user takes no action on a stash entry once viewed */
  readonly noActionTakenOnStashCount: number
  /**
   * The number of times the user has opened their external editor from the
   * suggested next steps view
   */
  readonly suggestedStepOpenInExternalEditor: number

  /**
   * The number of times the user has opened their repository in Finder/Explorer
   * from the suggested next steps view
   */
  readonly suggestedStepOpenWorkingDirectory: number

  /**
   * The number of times the user has opened their repository on GitHub from the
   * suggested next steps view
   */
  readonly suggestedStepViewOnGitHub: number

  /**
   * The number of times the user has used the publish repository action from the
   * suggested next steps view
   */
  readonly suggestedStepPublishRepository: number

  /**
   * The number of times the user has used the publish branch action branch from
   * the suggested next steps view
   */
  readonly suggestedStepPublishBranch: number

  /**
   * The number of times the user has used the Create PR suggestion
   * in the suggested next steps view. Note that this number is a
   * subset of `createPullRequestCount`. I.e. if the Create PR suggestion
   * is invoked both `suggestedStepCreatePR` and `createPullRequestCount`
   * will increment whereas if a PR is created from the menu or from
   * a keyboard shortcut only `createPullRequestCount` will increment.
   */
  readonly suggestedStepCreatePullRequest: number

  /**
   * The number of times the user has used the view stash action from
   * the suggested next steps view
   */
  readonly suggestedStepViewStash: number

  /**
   *  _[Onboarding tutorial]_
   *  Has the user clicked the button to start the onboarding tutorial?
   */
  readonly tutorialStarted: boolean

  /**
   * _[Onboarding tutorial]_
   * Has the user successfully created a tutorial repo?
   */
  readonly tutorialRepoCreated: boolean

  /**
   * _[Onboarding tutorial]_
   * Has the user installed an editor, skipped this step, or have an editor already installed?
   */
  readonly tutorialEditorInstalled: boolean

  /**
   * _[Onboarding tutorial]_
   * Has the user successfully completed the create a branch step?
   */
  readonly tutorialBranchCreated: boolean

  /**
   * _[Onboarding tutorial]_
   * Has the user completed the edit a file step?
   */
  readonly tutorialFileEdited: boolean

  /**
   * _[Onboarding tutorial]_
   * Has the user completed the commit a file change step?
   */
  readonly tutorialCommitCreated: boolean

  /**
   * _[Onboarding tutorial]_
   * Has the user completed the push a branch step?
   */
  readonly tutorialBranchPushed: boolean

  /**
   * _[Onboarding tutorial]_
   * Has the user completed the create a PR step?
   */
  readonly tutorialPrCreated: boolean

  /**
   * _[Onboarding tutorial]_
   * Has the user completed all tutorial steps?
   */
  readonly tutorialCompleted: boolean

  /**
   * _[Onboarding tutorial]_
   * What's the highest tutorial step completed by user?
   * (`0` is tutorial created, first step is `1`)
   */
  readonly highestTutorialStepCompleted: number

  /**
   * _[Forks]_
   * How many commits did the user make in a repo they
   * don't have `write` access to?
   */
  readonly commitsToRepositoryWithoutWriteAccess: number

  /** _[Forks]_
   * How many forks did the user create from Desktop?
   */
  readonly forksCreated: number

  /**
   * How many times has the user begun creating an issue from Desktop?
   */
  readonly issueCreationWebpageOpenedCount: number

  /**
   * How many tags have been created from the Desktop UI?
   */
  readonly tagsCreatedInDesktop: number

  /**
   * How many tags have been created in total.
   */
  readonly tagsCreated: number

  /**
   * How many tags have been deleted.
   */
  readonly tagsDeleted: number

  /** Number of times the user has changed between unified and split diffs */
  readonly diffModeChangeCount: number

  /** Number of times the user has opened the diff options popover */
  readonly diffOptionsViewedCount: number

  /** Number of times the user has switched to or from History/Changes */
  readonly repositoryViewChangeCount: number

  /** Number of times the user has encountered an unhandled rejection */
  readonly unhandledRejectionCount: number

  /** The number of times a successful cherry pick occurs */
  readonly cherryPickSuccessfulCount: number

  /** The number of times a cherry pick is initiated through drag and drop */
  readonly cherryPickViaDragAndDropCount: number

  /** The number of times a cherry pick is initiated through the context menu */
  readonly cherryPickViaContextMenuCount: number

  /** The number of times a cherry pick drag was started and canceled */
  readonly cherryPickDragStartedAndCanceledCount: number

  /** The number of times conflicts encountered during a cherry pick  */
  readonly cherryPickConflictsEncounteredCount: number

  /** The number of times cherry pick ended successfully after conflicts  */
  readonly cherryPickSuccessfulWithConflictsCount: number

  /** The number of times cherry pick of multiple commits initiated  */
  readonly cherryPickMultipleCommitsCount: number

  /** The number of times a cherry pick was undone  */
  readonly cherryPickUndoneCount: number
}

export class StatsDatabase extends Dexie {
  public launches!: Dexie.Table<ILaunchStats, number>
  public dailyMeasures!: Dexie.Table<IDailyMeasures, number>

  public constructor(name: string) {
    super(name)

    this.version(1).stores({
      launches: '++',
    })

    this.version(DatabaseVersion).stores({
      dailyMeasures: '++id',
    })
  }
}
