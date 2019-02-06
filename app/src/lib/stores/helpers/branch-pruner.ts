import { Repository } from '../../../models/repository'
import { RepositoriesStore } from '../repositories-store'
import { Branch, BranchType } from '../../../models/branch'
import { GitStoreCache } from '../git-store-cache'
import { getMergedBranches, deleteBranch } from '../../git'
import { fatalError } from '../../fatal-error'
import { RepositoryStateCache } from '../repository-state-cache'
import * as moment from 'moment'

/** Check if a repo needs to be pruned at least every 4 hours */
const BackgroundPruneMinimumInterval = 1000 * 60 * 60 * 4
const ReservedBranches = [
  'master',
  'gh-pages',
  'HEAD',
  'develop',
  'dev',
  'development',
  'trunk',
  'devel',
  'release',
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
  ): Promise<ReadonlyArray<string> | null> {
    const gitStore = this.gitStoreCache.get(repository)
    return (
      (await gitStore.performFailableOperation(() =>
        getMergedBranches(repository, defaultBranch.name)
      )) || null
    )
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

    if (mergedBranches === null) {
      log.info('No branches to prune.')
      return
    }

    // Get all branches that exist on remote
    const localBranches = branchesState.allBranches.filter(
      x => x.type === BranchType.Local
    )

    // Create array of branches that can be pruned
    const candidateBranches = mergedBranches.filter(
      b => !ReservedBranches.includes(b)
    )
    const branchesReadyForPruning = new Array<Branch>()
    for (const branch of candidateBranches) {
      const localBranch = localBranches.find(
        localBranch =>
          localBranch.remote !== null && localBranch.name === branch
      )

      if (localBranch !== undefined) {
        branchesReadyForPruning.push(localBranch)
      }
    }

    log.info(
      `Pruning ${branchesReadyForPruning.length} refs from '${
        this.repository.name
      }' using '${defaultBranch.name} (${
        defaultBranch.tip.sha
      })' as base branch`
    )

    const gitStore = this.gitStoreCache.get(this.repository)
    for (const branch of branchesReadyForPruning) {
      await gitStore.performFailableOperation(() =>
        deleteBranch(this.repository, branch!, null, false)
      )
    }

    await this.onPruneCompleted(this.repository)

    this.repositoriesStore.updateLastPruneDate(this.repository, Date.now())
  }
}
