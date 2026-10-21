import { describe, it } from 'node:test'
import assert from 'node:assert'
import { RepositoryStateCache } from '../../src/lib/stores/repository-state-cache'
import { Repository } from '../../src/models/repository'
import { PullRequest } from '../../src/models/pull-request'
import { GitHubRepository } from '../../src/models/github-repository'
import {
  WorkingDirectoryStatus,
  WorkingDirectoryFileChange,
  AppFileStatusKind,
} from '../../src/models/status'
import { DiffSelection, DiffSelectionType } from '../../src/models/diff'
import { HistoryTabMode, IDisplayHistory } from '../../src/lib/app-state'
import { gitHubRepoFixture } from '../helpers/github-repo-builder'
import { TestStatsStore } from '../helpers/test-stats-store'

function createSamplePullRequest(gitHubRepository: GitHubRepository) {
  return new PullRequest(
    new Date(),
    'something',
    1,
    {
      ref: 'refs/heads/master',
      sha: 'deadbeef',
      gitHubRepository,
    },
    {
      ref: 'refs/heads/my-cool-feature',
      sha: 'deadbeef',
      gitHubRepository,
    },
    'shiftkey',
    false,
    'something body'
  )
}

describe('RepositoryStateCache', () => {
  it('can update branches state for a repository', () => {
    const repository = new Repository('/something/path', 1, null, false)
    const gitHubRepository = gitHubRepoFixture({
      name: 'desktop',
      owner: 'desktop',
    })
    const firstPullRequest = createSamplePullRequest(gitHubRepository)

    const cache = new RepositoryStateCache(new TestStatsStore())

    cache.updateBranchesState(repository, () => {
      return {
        openPullRequests: [firstPullRequest],
        isLoadingPullRequests: true,
      }
    })

    const { branchesState } = cache.get(repository)
    assert(branchesState.isLoadingPullRequests)
    assert.equal(branchesState.openPullRequests.length, 1)
  })

  it('can update changes state for a repository', () => {
    const repository = new Repository('/something/path', 1, null, false)
    const files = [
      new WorkingDirectoryFileChange(
        'README.md',
        { kind: AppFileStatusKind.New },
        DiffSelection.fromInitialSelection(DiffSelectionType.All)
      ),
    ]

    const summary = 'Hello world!'

    const cache = new RepositoryStateCache(new TestStatsStore())

    cache.updateChangesState(repository, () => {
      return {
        workingDirectory: WorkingDirectoryStatus.fromFiles(files),
        commitMessage: {
          summary,
          description: null,
          timestamp: Date.now(),
        },
        showCoAuthoredBy: true,
      }
    })

    const { changesState } = cache.get(repository)
    assert(changesState.workingDirectory.includeAll)
    assert.equal(changesState.workingDirectory.files.length, 1)
    assert(changesState.showCoAuthoredBy)
    assert.equal(changesState.commitMessage.summary, summary)
  })

  it('can update compare state for a repository', () => {
    const repository = new Repository('/something/path', 1, null, false)
    const filterText = 'my-cool-branch'

    const cache = new RepositoryStateCache(new TestStatsStore())

    cache.updateCompareState(repository, () => {
      const newState: IDisplayHistory = {
        kind: HistoryTabMode.History,
      }

      return {
        formState: newState,
        filterText,
        commitSHAs: ['deadbeef'],
      }
    })

    const { compareState } = cache.get(repository)
    assert.equal(compareState.formState.kind, HistoryTabMode.History)
    assert.equal(compareState.filterText, filterText)
    assert.equal(compareState.commitSHAs.length, 1)
  })

  it('keeps the state when the account changes', () => {
    const alice = new Repository(
      '/path',
      1,
      null,
      false,
      null,
      {},
      false,
      undefined,
      undefined,
      'alice'
    )
    const bob = new Repository(
      '/path',
      1,
      null,
      false,
      null,
      {},
      false,
      undefined,
      undefined,
      'bob'
    )
    const cache = new RepositoryStateCache(new TestStatsStore())

    cache.update(alice, () => ({ isPushPullFetchInProgress: true }))
    cache.update(bob, () => ({ isPushPullFetchInProgress: false }))

    assert.equal(cache.get(alice).isPushPullFetchInProgress, false)
  })

  it('keeps separate state for worktrees of the same repository', () => {
    const main = new Repository('/main', 1, null, false)
    const worktree = new Repository('/worktree', 1, null, false)
    const cache = new RepositoryStateCache(new TestStatsStore())

    cache.update(main, () => ({ isPushPullFetchInProgress: true }))

    assert.equal(cache.get(worktree).isPushPullFetchInProgress, false)
  })

  it('keeps separate state for repositories that are not persisted', () => {
    const first = new Repository('/path', -1, null, false)
    const second = new Repository('/path', -1, null, false, 'alias')
    const cache = new RepositoryStateCache(new TestStatsStore())

    cache.update(first, () => ({ isPushPullFetchInProgress: true }))

    assert.equal(cache.get(second).isPushPullFetchInProgress, false)
  })
})
