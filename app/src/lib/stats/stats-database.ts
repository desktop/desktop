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
