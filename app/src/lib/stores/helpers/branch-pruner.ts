import { Repository } from '../../../models/repository'
import { RepositoriesStore } from '../repositories-store'
import { Branch } from '../../../models/branch'
import { GitStoreCache } from '../git-store-cache'
import {
  getMergedBranches,
  getCheckoutsAfterDate,
  getSymbolicRef,
  IMergedBranch,
  formatAsLocalRef,
  deleteLocalBranch,
} from '../../git'
import { fatalError } from '../../fatal-error'
import { RepositoryStateCache } from '../repository-state-cache'
import * as moment from 'moment'

/** Check if a repo needs to be pruned at least every 4 hours */
const BackgroundPruneMinimumInterval = 1000 * 60 * 60 * 4
const ReservedRefs = [
  'HEAD',
  'refs/heads/master',
  'refs/heads/gh-pages',
  'refs/heads/develop',
  'refs/heads/dev',
  'refs/heads/development',
  'refs/heads/trunk',
  'refs/heads/devel',
  'refs/heads/release',
]

export class BranchPruner {
  private timer: number | null = null

  public constructor(
    private readonly repository: Repository,
    private readonly gitStoreCache: GitStoreCache,
    private readonly repositoriesStore: RepositoriesStore,
    private readonly repositoriesStateCache: RepositoryStateCache,
    private readonly onPruneCompleted: (repository: Repository) => Promise<void>
  ) {}

  public async start() {
    if (this.timer !== null) {
      fatalError(
        `A background prune task is already active and cannot begin pruning on ${
          this.repository.name
        }`
      )
    }

    await this.pruneLocalBranches()
    this.timer = window.setInterval(
      () => this.pruneLocalBranches(),
      BackgroundPruneMinimumInterval
    )
  }

  public stop() {
    if (this.timer === null) {
      return
    }

    clearInterval(this.timer)
    this.timer = null
  }

  private async findBranchesMergedIntoDefaultBranch(
    repository: Repository,
    defaultBranch: Branch
  ): Promise<ReadonlyArray<IMergedBranch>> {
    const gitStore = this.gitStoreCache.get(repository)
    const mergedBranches = await gitStore.performFailableOperation(() =>
      getMergedBranches(repository, defaultBranch.name)
    )

    if (mergedBranches === undefined) {
      return []
    }

    const currentBranchCanonicalRef = await getSymbolicRef(repository, 'HEAD')

    // remove the current branch
    return currentBranchCanonicalRef === null
      ? mergedBranches
      : mergedBranches.filter(
          mb => mb.canonicalRef !== currentBranchCanonicalRef
        )
  }

  /**
   * Locally prune branches when the following criteria are met
   * 1. deleted on the remote (github.com) and
   * 2. merged into the repository's default branch and
   * 3. hasn't been checked out locally since `timeSinceLastCheckout`
   *
   * Note: This is ran automatically by calling `start` on the `BranchPruner` instance
   *
   * @param timeSinceLastCheckout limits pruning to branches that haven't been checked out since this date (defaults to 2 weeks before today)
   * @returns true when branches have been prune
   */
  public async prune(
    timeSinceLastCheckout: Date | null = moment()
      .subtract(2, 'weeks')
      .toDate()
  ): Promise<boolean> {
    const { branchesState } = this.repositoriesStateCache.get(this.repository)
    const { defaultBranch } = branchesState

    if (defaultBranch === null) {
      return false
    }

    const branchesReadyForPruning = await this.getBranchesReadyForPruning(
      timeSinceLastCheckout
    )
    if (branchesReadyForPruning.length === 0) {
      return false
    }

    log.info(
      `Pruning ${
        branchesReadyForPruning.length
      } branches that have been merged into the default branch, ${
        defaultBranch.name
      } (${defaultBranch.tip.sha}), from '${this.repository.name}`
    )

    const gitStore = this.gitStoreCache.get(this.repository)
    const branchRefPrefix = `refs/heads/`

    for (const branch of branchesReadyForPruning) {
      if (!branch.canonicalRef.startsWith(branchRefPrefix)) {
        continue
      }

      const branchName = branch.canonicalRef.substr(branchRefPrefix.length)

      const isDeleted =
        __DEV__ ||
        (await gitStore.performFailableOperation(() =>
          deleteLocalBranch(this.repository, branchName)
        ))

      if (isDeleted) {
        log.info(`Pruned branch ${branchName} (was ${branch.sha})`)
      }
    }

    return true
  }

  private async getBranchesReadyForPruning(
    timeSinceLastCheckout: Date | null
  ): Promise<ReadonlyArray<IMergedBranch>> {
    const { branchesState } = this.repositoriesStateCache.get(this.repository)
    const { defaultBranch } = branchesState

    if (defaultBranch === null) {
      return []
    }

    const mergedBranches = await this.findBranchesMergedIntoDefaultBranch(
      this.repository,
      defaultBranch
    )

    if (mergedBranches.length === 0) {
      return []
    }

    const recentlyCheckedOutBranches =
      timeSinceLastCheckout !== null
        ? await getBranchCheckouts(this.repository, timeSinceLastCheckout)
        : new Map<string, Date>()

    const recentlyCheckedOutCanonicalRefs = new Set(
      [...recentlyCheckedOutBranches.keys()].map(formatAsLocalRef)
    )

    // Create array of branches that can be pruned
    const branchesReadyForPruning = mergedBranches.filter(
      mb =>
        !ReservedRefs.includes(mb.canonicalRef) &&
        !recentlyCheckedOutCanonicalRefs.has(mb.canonicalRef)
    )

    return branchesReadyForPruning
  }

  private async pruneLocalBranches(): Promise<void> {
    if (this.repository.gitHubRepository === null) {
      return
    }

    // Get the last time this repo was pruned
    const lastPruneDate = await this.repositoriesStore.getLastPruneDate(
      this.repository
    )

    // Only prune if it's been at least 24 hours since the last time
    const dateNow = moment()
    const threshold = dateNow.subtract(24, 'hours')

    // Using type coelescing behavior to deal with Dexie returning `undefined`
    // for records that haven't been updated with the new field yet
    if (lastPruneDate != null && threshold.isBefore(lastPruneDate)) {
      log.info(
        `Last prune took place ${moment(lastPruneDate).from(
          dateNow
        )} - skipping`
      )
      return
    }

    const didPruneHappen = await this.prune()
    await this.repositoriesStore.updateLastPruneAttemptDate(
      this.repository,
      Date.now()
    )
    didPruneHappen && this.onPruneCompleted(this.repository)
  }
}
