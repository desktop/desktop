import { expect } from 'chai'
import { RepositoryStateCache } from '../../src/lib/stores/repository-state-cache'
import { TestGitHubUserDatabase } from '../helpers/databases'
import { GitHubUserStore } from '../../src/lib/stores'
import { Repository } from '../../src/models/repository'
import { PullRequest } from '../../src/models/pull-request'
import { GitHubRepository } from '../../src/models/github-repository'

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
  it('can update branches state for a repository', () => {
    const db = new TestGitHubUserDatabase()
    const githubUserStore = new GitHubUserStore(db)

    const repository = new Repository('/something/path', 1, null, false)

    const gitHubRepository = createSampleGitHubRepository()
    const firstPullRequest = createSamplePullRequest(gitHubRepository)

    const cache = new RepositoryStateCache(githubUserStore)
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
})
