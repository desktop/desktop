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

  public async prune(): Promise<void> {
    return this.pruneLocalBranches()
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
    if (
      !__DEV__ &&
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
    const { defaultBranch, allBranches } = branchesState

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

    const branchRefPrefix = `refs/heads/`

    const branchesReadyForPruning = candidateBranches.filter(mb => {
      if (recentlyCheckedOutCanonicalRefs.has(mb.canonicalRef)) {
        return false
      }

      const branchName = mb.canonicalRef.substr(branchRefPrefix.length)

      const localBranch = allBranches.find(
        b => b.type === BranchType.Local && b.name === branchName
      )

      if (localBranch === undefined) {
        // unable to find the local branch in repository state, this feels
        // sufficient concerning to indicate we shouldn't try and delete this
        // reference
        return false
      }

      if (localBranch.upstream === null) {
        // no remote ref is being tracked for this branch, which means it
        // most likely wasn't pushed to the remote, so we can include this
        // in our prune list
        return true
      }

      const remoteRef = allBranches.find(
        b => b.type === BranchType.Remote && b.name === localBranch.upstream
      )

      if (remoteRef === undefined) {
        // the remote ref cannot be found for this branch, which is a good
        // indicator it was deleted from the repository and can be cleaned up
        // here too
        return true
      }

      return false
    })

    log.info(
      `[Branch Pruner] pruning ${
        branchesReadyForPruning.length
      } branches that have been merged into the default branch, ${
        defaultBranch.name
      } (${defaultBranch.tip.sha}), from '${this.repository.name}`
    )

    const gitStore = this.gitStoreCache.get(this.repository)

    for (const branch of branchesReadyForPruning) {
      if (!branch.canonicalRef.startsWith(branchRefPrefix)) {
        continue
      }

      const branchName = branch.canonicalRef.substr(branchRefPrefix.length)

      // don't delete branches when in development mode to help with testing
      if (__DEV__) {
        log.info(
          `[Branch Pruner] ${branchName} (was ${
            branch.sha
          }) has been marked for pruning.`
        )
        continue
      }

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
}
