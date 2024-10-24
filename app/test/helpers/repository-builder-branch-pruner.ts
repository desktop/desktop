import { setupEmptyRepository } from './repositories'
import { makeCommit, switchTo } from './repository-scaffolding'
import { exec } from 'dugite'
import { RepositoriesStore, GitStore } from '../../src/lib/stores'
import { RepositoryStateCache } from '../../src/lib/stores/repository-state-cache'
import {
  Repository,
  isRepositoryWithGitHubRepository,
} from '../../src/models/repository'
import { IAPIFullRepository, getDotComAPIEndpoint } from '../../src/lib/api'
import { shell } from './test-app-shell'
import { StatsStore, StatsDatabase } from '../../src/lib/stats'
import { UiActivityMonitor } from '../../src/ui/lib/ui-activity-monitor'
import { fakePost } from '../fake-stats-post'

export async function createRepository() {
  const repo = await setupEmptyRepository()

  const firstCommit = {
    entries: [
      { path: 'foo', contents: '' },
      { path: 'perlin', contents: 'perlin' },
    ],
  }

  await makeCommit(repo, firstCommit)

  // creating the new branch before switching so that we have distinct changes
  // on both branches and also to ensure a merge commit is needed
  await exec(['branch', 'other-branch'], repo.path)

  const secondCommit = {
    entries: [{ path: 'foo', contents: 'b1' }],
  }

  await makeCommit(repo, secondCommit)

  await switchTo(repo, 'other-branch')

  const thirdCommit = {
    entries: [{ path: 'bar', contents: 'b2' }],
  }
  await makeCommit(repo, thirdCommit)

  const fourthCommit = {
    entries: [{ path: 'baz', contents: 'very much more words' }],
  }
  await makeCommit(repo, fourthCommit)

  await switchTo(repo, 'master')

  // ensure the merge operation always creates a merge commit
  await exec(['merge', 'other-branch', '--no-ff'], repo.path)

  // clear reflog of all entries, so any branches are considered candidates for pruning
  await exec(
    ['reflog', 'expire', '--expire=now', '--expire-unreachable=now', '--all'],
    repo.path
  )

  return repo.path
}

export async function setupRepository(
  path: string,
  repositoriesStore: RepositoriesStore,
  repositoriesStateCache: RepositoryStateCache,
  includesGhRepo: boolean,
  defaultBranchName: string,
  lastPruneDate?: Date
) {
  let repository = await repositoriesStore.addRepository(path)
  if (includesGhRepo) {
    const apiRepo: IAPIFullRepository = {
      clone_url: 'string',
      ssh_url: 'string',
      html_url: 'string',
      name: 'string',
      owner: {
        id: 0,
        html_url: '',
        login: '',
        avatar_url: '',
        type: 'User',
      },
      private: false,
      fork: false,
      default_branch: defaultBranchName,
      pushed_at: 'string',
      has_issues: true,
      archived: false,
      permissions: {
        pull: true,
        push: true,
        admin: false,
      },
      parent: undefined,
    }

    const endpoint = getDotComAPIEndpoint()
    repository = await repositoriesStore.setGitHubRepository(
      repository,
      await repositoriesStore.upsertGitHubRepository(endpoint, apiRepo)
    )
  }
  await primeCaches(repository, repositoriesStateCache)

  if (lastPruneDate && isRepositoryWithGitHubRepository(repository)) {
    repositoriesStore.updateLastPruneDate(repository, lastPruneDate.getTime())
  }

  return repository
}

/**
 * Setup state correctly without having to expose
 * the internals of the GitStore and caches
 */
async function primeCaches(
  repository: Repository,
  repositoriesStateCache: RepositoryStateCache
) {
  const gitStore = new GitStore(
    repository,
    shell,
    new StatsStore(
      new StatsDatabase('test-StatsDatabase'),
      new UiActivityMonitor(),
      fakePost
    )
  )

  // rather than re-create the branches and stuff as objects, these calls
  // will run the underlying Git operations and update the GitStore state
  await gitStore.loadRemotes()
  await gitStore.loadBranches()
  await gitStore.loadStatus()

  // once that is done, we can populate the repository state in the same way
  // that AppStore does for the sake of this test
  repositoriesStateCache.updateBranchesState(repository, () => ({
    tip: gitStore.tip,
    defaultBranch: gitStore.defaultBranch,
    upstreamDefaultBranch: gitStore.upstreamDefaultBranch,
    allBranches: gitStore.allBranches,
    recentBranches: gitStore.recentBranches,
  }))
}
