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

  /** The number of times a branch is compared to `master` */
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

  /** The number of times the user dismisses the diverged branch notification */
  readonly divergingBranchBannerDismissal: number

  /** The number of times the user merges from the diverged branch notification merge CTA button */
  readonly divergingBranchBannerInitatedMerge: number

  /** The number of times the user compares from the diverged branch notification compare CTA button */
  readonly divergingBranchBannerInitiatedCompare: number

  /**
   * The number of times the user merges from the compare view after getting to that state
   * from the diverged branch notification compare CTA button
   */
  readonly divergingBranchBannerInfluencedMerge: number

  /** The number of times the diverged branch notification is displayed */
  readonly divergingBranchBannerDisplayed: number

  /** The number of times the user pushes to GitHub.com */
  readonly dotcomPushCount: number

  /** The number of times the user pushed to a GitHub enterprise instance */
  readonly enterprisePushCount: number

  /** The number of times the users pushes to a generic remote */
  readonly externalPushCount: number

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

  /** The number of time the user made a commit to a repo hosted on Github.com */
  readonly dotcomCommits: number
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
