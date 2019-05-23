import { Repository } from '../../../models/repository'
import { RepositoriesStore } from '../repositories-store'
import { Branch, BranchType } from '../../../models/branch'
import { GitStoreCache } from '../git-store-cache'
import {
  getMergedBranches,
  getBranchCheckouts,
  getSymbolicRef,
  IMergedBranch,
  formatAsLocalRef,
  deleteLocalBranch,
  getBranches,
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

/**
 * Behavior flags for the branch prune execution, to aid with testing and
 * verifying locally.
 */
type PruneRuntimeOptions = {
  /**
   * By default the branch pruner will only run every 24 hours
   *
   * Set this flag to `false` to ignore this check.
   */
  readonly enforcePruneThreshold: boolean
  /**
   * By default the branch pruner will also delete the branches it believes can
   * be pruned safely.
   *
   * Set this to `false` to keep these in your repository.
   */
  readonly deleteBranch: boolean
}

const DefaultPruneOptions: PruneRuntimeOptions = {
  enforcePruneThreshold: true,
  deleteBranch: true,
}

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

    await this.pruneLocalBranches(DefaultPruneOptions)
    this.timer = window.setInterval(
      () => this.pruneLocalBranches(DefaultPruneOptions),
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

  public async testPrune(): Promise<void> {
    return this.pruneLocalBranches({
      enforcePruneThreshold: false,
      deleteBranch: false,
    })
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
   * Prune the local branches for the repository
   *
   * @param options configure the behaviour of the branch pruning process
   */
  private async pruneLocalBranches(
    options: PruneRuntimeOptions
  ): Promise<void> {
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
    if (
      options.enforcePruneThreshold &&
      lastPruneDate != null &&
      threshold.isBefore(lastPruneDate)
    ) {
      log.info(
        `[Branch Pruner] last prune took place ${moment(lastPruneDate).from(
          dateNow
        )} - skipping`
      )
      return
    }

    // Get list of branches that have been merged
    const { branchesState } = this.repositoriesStateCache.get(this.repository)
    const { defaultBranch } = branchesState

    if (defaultBranch === null) {
      return
    }

    const mergedBranches = await this.findBranchesMergedIntoDefaultBranch(
      this.repository,
      defaultBranch
    )

    if (mergedBranches.length === 0) {
      log.info('[Branch Pruner] no branches to prune.')
      return
    }

    // Get all branches checked out within the past 2 weeks
    const twoWeeksAgo = moment()
      .subtract(2, 'weeks')
      .toDate()

    const branchRefPrefix = `refs/heads/`

    const branchesReadyForPruning = await this.filterBranches(
      mergedBranches,
      twoWeeksAgo
    )

    log.info(
      `[Branch Pruner] pruning ${
        branchesReadyForPruning.length
      } branches that have been merged into the default branch, ${
        defaultBranch.name
      } (${defaultBranch.tip.sha}), from '${this.repository.name}`
    )

    if (!options.deleteBranch) {
      log.info(
        `[Branch Pruner] Branch pruning will not delete any branches because options.deleteBranch is false.`
      )
      for (const branch of branchesReadyForPruning) {
        const branchName = branch.canonicalRef.substr(branchRefPrefix.length)
        log.info(
          `[Branch Pruner] ${branchName} (was ${
            branch.sha
          }) has been marked for pruning.`
        )
      }
      return
    }

    const gitStore = this.gitStoreCache.get(this.repository)

    for (const branch of branchesReadyForPruning) {
      const branchName = branch.canonicalRef.substr(branchRefPrefix.length)

      const isDeleted = await gitStore.performFailableOperation(() =>
        deleteLocalBranch(this.repository, branchName)
      )

      if (isDeleted) {
        log.info(
          `[Branch Pruner] branch ${branchName} (${branch.sha}) was pruned`
        )
      }
    }

    await this.repositoriesStore.updateLastPruneDate(
      this.repository,
      Date.now()
    )
    this.onPruneCompleted(this.repository)
  }

  private async filterBranches(
    mergedBranches: ReadonlyArray<IMergedBranch>,
    afterDate: Date
  ): Promise<ReadonlyArray<IMergedBranch>> {
    const { branchesState } = this.repositoriesStateCache.get(this.repository)
    const { allBranches } = branchesState

    const recentlyCheckedOutBranches = await getBranchCheckouts(
      this.repository,
      afterDate
    )

    const recentlyCheckedOutCanonicalRefs = new Set(
      [...recentlyCheckedOutBranches.keys()].map(formatAsLocalRef)
    )

    const candidateBranches = mergedBranches.filter(
      mb => !ReservedRefs.includes(mb.canonicalRef)
    )

    const branchRefPrefix = `refs/heads/`

    const branchesReadyForPruning = new Array<IMergedBranch>()

    for (const mb of candidateBranches) {
      if (recentlyCheckedOutCanonicalRefs.has(mb.canonicalRef)) {
        // branch was recently checked out, exclude it from pruning
        continue
      }

      if (!mb.canonicalRef.startsWith(branchRefPrefix)) {
        // branch does not match the expected conventions, exclude it
        continue
      }

      const branchName = mb.canonicalRef.substr(branchRefPrefix.length)

      const localBranch = allBranches.find(
        b => b.type === BranchType.Local && b.name === branchName
      )

      if (localBranch === undefined) {
        // unable to find the local branch in repository state, this feels
        // sufficient concerning to indicate we shouldn't try and delete this
        // reference
        continue
      }

      if (localBranch.upstream === null) {
        // no remote ref is being tracked for this branch, which means it
        // most likely wasn't pushed to the remote, so we can include this
        // in our prune list
        branchesReadyForPruning.push(mb)
        continue
      }

      // we cannot use `allBranches` here because it merges together local and
      // remote branches to de-dupe results, so instead we're going to make a
      // Git call, one per candidate branch that reaches this point, and see if
      // the remote ref exists
      //
      // As the app runs `git fetch --prune` regularly, this is a good enough
      // indicator that the remote ref is gone especially when we're only
      // filtering local branches that have not been used in the past 2 weeks
      const remoteBranch = await getBranches(
        this.repository,
        `refs/remotes/${localBranch.upstream}`
      )

      if (remoteBranch.length === 0) {
        branchesReadyForPruning.push(mb)
      }
    }

    return branchesReadyForPruning
  }
}
