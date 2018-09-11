import { expect } from 'chai'
import { RepositoryStateCache } from '../../src/lib/stores/repository-state-cache'
import { TestGitHubUserDatabase } from '../helpers/databases'
import { GitHubUserStore } from '../../src/lib/stores'
import { Repository } from '../../src/models/repository'
import { PullRequest } from '../../src/models/pull-request'
import { GitHubRepository } from '../../src/models/github-repository'
import {
  WorkingDirectoryStatus,
  WorkingDirectoryFileChange,
  AppFileStatus,
} from '../../src/models/status'
import { DiffSelection, DiffSelectionType } from '../../src/models/diff'

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
  let githubUserStore: GitHubUserStore | null = null

  beforeEach(() => {
    r = new Repository('/something/path', 1, null, false)

    const db = new TestGitHubUserDatabase()
    githubUserStore = new GitHubUserStore(db)
  })

  it('can update branches state for a repository', () => {
    const gitHubRepository = createSampleGitHubRepository()
    const firstPullRequest = createSamplePullRequest(gitHubRepository)

    const repository = r!

    const cache = new RepositoryStateCache(githubUserStore!)

    cache.updateBranchesState(repository, () => {
      return {
        openPullRequests: [firstPullRequest],
        isLoadingPullRequests: true,
      }
    })

    const { branchesState } = cache.get(repository)
    expect(branchesState.isLoadingPullRequests).is.true
    expect(branchesState.openPullRequests.length).equals(1)
  })

  it('can update changes state for a repository', () => {
    const files = [
      new WorkingDirectoryFileChange(
        'README.md',
        AppFileStatus.New,
        DiffSelection.fromInitialSelection(DiffSelectionType.All)
      ),
    ]

    const summary = 'Hello world!'
    const repository = r!

    const cache = new RepositoryStateCache(githubUserStore!)

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
    expect(changesState.workingDirectory.includeAll).is.true
    expect(changesState.workingDirectory.files.length).equals(1)
    expect(changesState.showCoAuthoredBy).is.true
    expect(changesState.commitMessage!.summary).equals(summary)
  })
})
