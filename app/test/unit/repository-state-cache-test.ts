import { seed, rawGit, count } from '../helpers/assisted-commit'
import { writeFile, rename, mkdir } from 'fs/promises'
import { join } from 'path'
import { createAssistedCommitRunHarness } from '../helpers/assisted-commit-run'
import {
  deferred,
  wholeSelectionResponse,
} from '../helpers/copilot-assisted-commit'
import { createTempDirectory } from '../helpers/temp'
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
})

describe('repository state transfer during assisted runs', () => {
  it('reconciles visible changes and draft into a refreshed repository representation after cancellation', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    await h.dispatcher.setCommitMessage(repository, {
      summary: 'Keep draft',
      description: 'Keep body',
      timestamp: Date.now(),
    })
    const analyzing = deferred<void>()
    const finish = deferred<void>()
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      analyzing.resolve()
      await finish.promise
      return wholeSelectionResponse(analysis)
    })
    const run = h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    await analyzing.promise
    const updated = new Repository(
      repository.path,
      repository.id,
      null,
      false,
      'New alias',
      {},
      false,
      repository.gitDir
    )
    h.appStore['selectedRepository'] = updated
    await h.appStore._refreshRepository(updated)
    h.cancel(updated)
    finish.resolve()
    await run
    assert.strictEqual(
      h.state(updated).changesState.workingDirectory.files.length,
      1
    )
    assert.strictEqual(
      h.state(updated).changesState.commitMessage.summary,
      'Keep draft'
    )
  })

  it('retains latest user commit inputs across three metadata hashes', async t => {
    const source = await seed(t, { file: 'before\n' })
    const h = await createAssistedCommitRunHarness(t)
    const a = await h.register(source)
    h.dispatcher.setCoAuthors(a, [
      {
        kind: 'known',
        name: 'Old author',
        email: 'old@example.invalid',
        username: null,
      },
    ])
    const b = new Repository(
      a.path,
      a.id,
      null,
      false,
      'Alias B',
      {},
      false,
      a.gitDir
    )
    h.dispatcher.setCoAuthors(b, [
      {
        kind: 'known',
        name: 'New author',
        email: 'new@example.invalid',
        username: null,
      },
    ])
    await h.dispatcher.setCommitMessage(b, {
      summary: 'Newest manual draft',
      description: 'Keep',
      timestamp: Date.now(),
    })
    const c = new Repository(
      a.path,
      a.id,
      null,
      false,
      'Alias C',
      {},
      false,
      a.gitDir
    )
    await h.appStore._loadStatus(c)
    assert.strictEqual(h.state(c).changesState.coAuthors[0]?.kind, 'known')
    assert.deepStrictEqual(
      h.state(c).changesState.coAuthors,
      h.state(b).changesState.coAuthors
    )
    assert.strictEqual(
      h.state(c).changesState.commitMessage.summary,
      'Newest manual draft'
    )
  })

  it('does not let obsolete GitStore emissions replace a transferred native tip', async t => {
    const source = await seed(t, { file: 'before\n' })
    const h = await createAssistedCommitRunHarness(t)
    const a = await h.register(source)
    const oldStore = h.appStore['gitStoreCache'].get(a)
    const b = new Repository(
      a.path,
      a.id,
      null,
      false,
      'Updated alias',
      {},
      false,
      a.gitDir
    )
    h.stores.repositoryStateCache.transferState(a, b)
    await rawGit(b, ['commit', '--allow-empty', '-m', 'New native tip'])
    await h.appStore._loadStatus(b)
    const currentTip = h.state(b).branchesState.tip
    oldStore['emitUpdate']()
    assert.deepStrictEqual(h.state(b).branchesState.tip, currentTip)
    assert.deepStrictEqual(h.state(a).branchesState.tip, currentTip)
  })

  it('rejects old-path native emissions after the same worktree moves', async t => {
    const source = await seed(t, { file: 'before\n' })
    const h = await createAssistedCommitRunHarness(t)
    const old = await h.register(source)
    const oldStore = h.appStore['gitStoreCache'].get(old)
    const path = join(await createTempDirectory(t), 'moved')
    await rename(source.path, path)
    await mkdir(source.path)
    const moved = new Repository(
      path,
      old.id,
      null,
      false,
      null,
      {},
      false,
      join(path, '.git')
    )
    h.stores.repositoryStateCache.transferState(old, moved)
    await rawGit(moved, ['commit', '--allow-empty', '-m', 'New moved tip'])
    await h.appStore._loadStatus(moved)
    const current = h.state(moved)
    oldStore['emitUpdate']()
    assert.deepStrictEqual(
      h.state(moved).branchesState.tip,
      current.branchesState.tip
    )
    assert.deepStrictEqual(
      h.state(moved).localCommitSHAs,
      current.localCommitSHAs
    )
    assert.notDeepStrictEqual(
      h.state(old).branchesState.tip,
      current.branchesState.tip
    )
    assert.strictEqual(await count(moved), 2)
  })
})
