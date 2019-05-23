import { Repository } from '../../../models/repository'
import { RepositoriesStore } from '../repositories-store'
import { Branch } from '../../../models/branch'
import { GitStoreCache } from '../git-store-cache'
import {
  getMergedBranches,
  getBranchCheckouts,
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
        `Last prune took place ${moment(lastPruneDate).from(
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
      log.info('No branches to prune.')
      return
    }

    // Get all branches checked out within the past 2 weeks
    const twoWeeksAgo = moment()
      .subtract(2, 'weeks')
      .toDate()
    const recentlyCheckedOutBranches = await getBranchCheckouts(
      this.repository,
      twoWeeksAgo
    )
    const recentlyCheckedOutCanonicalRefs = new Set(
      [...recentlyCheckedOutBranches.keys()].map(formatAsLocalRef)
    )

    // Create array of branches that can be pruned
    const candidateBranches = mergedBranches.filter(
      mb => !ReservedRefs.includes(mb.canonicalRef)
    )

    const branchesReadyForPruning = candidateBranches.filter(
      mb => !recentlyCheckedOutCanonicalRefs.has(mb.canonicalRef)
    )

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

      if (options.deleteBranch) {
        const branchName = branch.canonicalRef.substr(branchRefPrefix.length)

        const isDeleted = await gitStore.performFailableOperation(() =>
          deleteLocalBranch(this.repository, branchName)
        )

        if (isDeleted) {
          log.info(`Pruned branch ${branchName} (was ${branch.sha})`)
        }
      }
    }

    await this.repositoriesStore.updateLastPruneDate(
      this.repository,
      Date.now()
    )
    this.onPruneCompleted(this.repository)
  }
}
