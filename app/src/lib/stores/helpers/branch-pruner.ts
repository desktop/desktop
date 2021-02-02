import {
  Repository,
  isRepositoryWithGitHubRepository,
} from '../../../models/repository'
import { RepositoriesStore } from '../repositories-store'
import { Branch } from '../../../models/branch'
import { GitStoreCache } from '../git-store-cache'
import {
  getMergedBranches,
  getBranchCheckouts,
  getSymbolicRef,
  formatAsLocalRef,
  getBranches,
  deleteLocalBranch,
} from '../../git'
import { fatalError } from '../../fatal-error'
import { RepositoryStateCache } from '../repository-state-cache'
import moment from 'moment'

/** Check if a repo needs to be pruned at least every 4 hours */
const BackgroundPruneMinimumInterval = 1000 * 60 * 60 * 4
const ReservedRefs = [
  'HEAD',
  'refs/heads/main',
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
        `A background prune task is already active and cannot begin pruning on ${this.repository.name}`
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

  /** @returns a map of canonical refs to their shas */
  private async findBranchesMergedIntoDefaultBranch(
    repository: Repository,
    defaultBranch: Branch
  ): Promise<ReadonlyMap<string, string>> {
    const gitStore = this.gitStoreCache.get(repository)
    const mergedBranches = await gitStore.performFailableOperation(() =>
      getMergedBranches(repository, defaultBranch.name)
    )

    if (mergedBranches === undefined) {
      return new Map<string, string>()
    }

    const currentBranchCanonicalRef = await getSymbolicRef(repository, 'HEAD')

    // remove the current branch
    if (currentBranchCanonicalRef) {
      mergedBranches.delete(currentBranchCanonicalRef)
    }

    return mergedBranches
  }

  /**
   * Prune the local branches for the repository
   *
   * @param options configure the behaviour of the branch pruning process
   */
  private async pruneLocalBranches(
    options: PruneRuntimeOptions
  ): Promise<void> {
    if (!isRepositoryWithGitHubRepository(this.repository)) {
      return
    }

    // Get the last time this repo was pruned
    const lastPruneDate = await this.repositoriesStore.getLastPruneDate(
      this.repository
    )

    // Only prune if it's been at least 24 hours since the last time
    const dateNow = moment()
    const threshold = dateNow.subtract(24, 'hours')

    // Using type coalescing behavior to deal with Dexie returning `undefined`
    // for records that haven't been updated with the new field yet
    if (
      options.enforcePruneThreshold &&
      lastPruneDate != null &&
      threshold.isBefore(lastPruneDate)
    ) {
      log.info(
        `[BranchPruner] Last prune took place ${moment(lastPruneDate).from(
          dateNow
        )} - skipping`
      )
      return
    }

    // update the last prune date first thing after we check it!
    await this.repositoriesStore.updateLastPruneDate(
      this.repository,
      Date.now()
    )

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

    if (mergedBranches.size === 0) {
      log.info('[BranchPruner] No branches to prune.')
      return
    }

    // Get all branches checked out within the past 2 weeks
    const twoWeeksAgo = moment().subtract(2, 'weeks').toDate()
    const recentlyCheckedOutBranches = await getBranchCheckouts(
      this.repository,
      twoWeeksAgo
    )
    const recentlyCheckedOutCanonicalRefs = new Set(
      [...recentlyCheckedOutBranches.keys()].map(formatAsLocalRef)
    )

    // get the locally cached branches of remotes (ie `remotes/origin/main`)
    const remoteBranches = (
      await getBranches(this.repository, `refs/remotes/`)
    ).map(b => formatAsLocalRef(b.name))

    // create list of branches to be pruned
    const branchesReadyForPruning = Array.from(mergedBranches.keys()).filter(
      ref => {
        if (ReservedRefs.includes(ref)) {
          return false
        }
        if (recentlyCheckedOutCanonicalRefs.has(ref)) {
          return false
        }
        const upstreamRef = getUpstreamRefForLocalBranchRef(ref, allBranches)
        if (upstreamRef === undefined) {
          return false
        }
        return !remoteBranches.includes(upstreamRef)
      }
    )

    log.info(
      `[BranchPruner] Pruning ${branchesReadyForPruning.length} branches that have been merged into the default branch, ${defaultBranch.name} (${defaultBranch.tip.sha}), from '${this.repository.name}`
    )

    const gitStore = this.gitStoreCache.get(this.repository)
    const branchRefPrefix = `refs/heads/`

    for (const branchCanonicalRef of branchesReadyForPruning) {
      if (!branchCanonicalRef.startsWith(branchRefPrefix)) {
        continue
      }

      const branchName = branchCanonicalRef.substr(branchRefPrefix.length)

      if (options.deleteBranch) {
        const isDeleted = await gitStore.performFailableOperation(() =>
          deleteLocalBranch(this.repository, branchName)
        )

        if (isDeleted) {
          log.info(
            `[BranchPruner] Pruned branch ${branchName} ((was ${mergedBranches.get(
              branchCanonicalRef
            )}))`
          )
        }
      } else {
        log.info(`[BranchPruner] Branch '${branchName}' marked for deletion`)
      }
    }
    this.onPruneCompleted(this.repository)
  }
}

/**
 * @param ref the canonical ref for a local branch
 * @param allBranches a list of all branches in the Repository model
 * @returns the canonical upstream branch ref or undefined if upstream can't be reliably determined
 */
function getUpstreamRefForLocalBranchRef(
  ref: string,
  allBranches: ReadonlyArray<Branch>
): string | undefined {
  const branch = allBranches.find(b => formatAsLocalRef(b.name) === ref)
  // if we can't find a branch model, we can't determine the ref's upstream
  if (branch === undefined) {
    return undefined
  }
  const { upstream } = branch
  // if there's no upstream in the branch, there's nothing to lookup
  if (upstream === null) {
    return undefined
  }
  return formatAsLocalRef(upstream)
}
