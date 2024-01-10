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
import { StatsDatabase, StatsStore } from '../../src/lib/stats'
import { UiActivityMonitor } from '../../src/ui/lib/ui-activity-monitor'
import { fakePost } from '../fake-stats-post'

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
  let repository: Repository
  let statsStore: StatsStore

  beforeEach(() => {
    repository = new Repository('/something/path', 1, null, false)

    statsStore = new StatsStore(
      new StatsDatabase('test-StatsDatabase'),
      new UiActivityMonitor(),
      fakePost
    )
  })

  it('can update branches state for a repository', () => {
    const gitHubRepository = gitHubRepoFixture({
      name: 'desktop',
      owner: 'desktop',
    })
    const firstPullRequest = createSamplePullRequest(gitHubRepository)

    const cache = new RepositoryStateCache(statsStore)

    cache.updateBranchesState(repository, () => {
      return {
        openPullRequests: [firstPullRequest],
        isLoadingPullRequests: true,
      }
    })

    const { branchesState } = cache.get(repository)
    expect(branchesState.isLoadingPullRequests).toBe(true)
    expect(branchesState.openPullRequests).toHaveLength(1)
  })

  it('can update changes state for a repository', () => {
    const files = [
      new WorkingDirectoryFileChange(
        'README.md',
        { kind: AppFileStatusKind.New },
        DiffSelection.fromInitialSelection(DiffSelectionType.All)
      ),
    ]

    const summary = 'Hello world!'

    const cache = new RepositoryStateCache(statsStore)

    cache.updateChangesState(repository, () => {
      return {
        workingDirectory: WorkingDirectoryStatus.fromFiles(files),
        commitMessage: {
          summary,
          description: null,
        },
        showCoAuthoredBy: true,
      }
    })

    const { changesState } = cache.get(repository)
    expect(changesState.workingDirectory.includeAll).toBe(true)
    expect(changesState.workingDirectory.files).toHaveLength(1)
    expect(changesState.showCoAuthoredBy).toBe(true)
    expect(changesState.commitMessage!.summary).toBe(summary)
  })

  it('can update compare state for a repository', () => {
    const filterText = 'my-cool-branch'

    const cache = new RepositoryStateCache(statsStore)

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
    expect(compareState.formState.kind).toBe(HistoryTabMode.History)
    expect(compareState.filterText).toBe(filterText)
    expect(compareState.commitSHAs).toHaveLength(1)
  })
})
