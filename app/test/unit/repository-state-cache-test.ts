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
import { HistoryTabMode } from '../../src/lib/app-state'
import { IGitHubUser } from '../../src/lib/databases'

function createSampleGitHubRepository() {
  return {
    dbID: 1,
    name: 'desktop',
    owner: {
      endpoint: 'https://api.github.com',
      login: 'desktop',
      hash: '',
      id: null,
    },
    endpoint: 'https://api.github.com',
    fullName: 'shiftkey/some-repo',
    private: false,
    fork: false,
    cloneURL: 'https://github.com/desktop/desktop.git',
    htmlURL: 'https://github.com/desktop/desktop',
    defaultBranch: 'master',
    hash: '',
    parent: null,
  }
}

function createSamplePullRequest(gitHubRepository: GitHubRepository) {
  return new PullRequest(
    10,
    new Date(),
    null,
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
    'shiftkey'
  )
}

describe('RepositoryStateCache', () => {
  let r: Repository | null = null
  const defaultGetUsersFunc = (repo: Repository) =>
    new Map<string, IGitHubUser>()

  beforeEach(() => {
    r = new Repository('/something/path', 1, null, false)
  })

  it('can update branches state for a repository', () => {
    const gitHubRepository = createSampleGitHubRepository()
    const firstPullRequest = createSamplePullRequest(gitHubRepository)

    const repository = r!

    const cache = new RepositoryStateCache(defaultGetUsersFunc)

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
    const repository = r!

    const cache = new RepositoryStateCache(defaultGetUsersFunc)

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
    const repository = r!

    const cache = new RepositoryStateCache(defaultGetUsersFunc)

    cache.updateCompareState(repository, () => {
      return {
        formState: {
          kind: HistoryTabMode.History,
        },
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
