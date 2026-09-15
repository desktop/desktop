import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  Repository,
  isRepositoryWithGitHubRepository,
  isRepositoryWithForkedGitHubRepository,
  getGitHubHtmlUrl,
  isForkedRepositoryContributingToParent,
} from '../../src/models/repository'
import { GitHubRepository } from '../../src/models/github-repository'
import { Owner } from '../../src/models/owner'

function createPlainRepository(): Repository {
  return new Repository('/path/to/repo', 1, null, false)
}

function createGitHubRepository(): Repository {
  const owner = new Owner('owner', 'https://api.github.com', 1)
  const ghRepo = new GitHubRepository(
    'repo',
    owner,
    1,
    false,
    'https://github.com/owner/repo',
    'https://github.com/owner/repo.git',
    true,
    false,
    null,
    null
  )
  return new Repository('/path/to/repo', 1, ghRepo, false)
}

function createForkedGitHubRepository(): Repository {
  const upstreamOwner = new Owner('upstream-owner', 'https://api.github.com', 1)
  const parentGhRepo = new GitHubRepository(
    'repo',
    upstreamOwner,
    1,
    false,
    'https://github.com/upstream-owner/repo',
    'https://github.com/upstream-owner/repo.git',
    true,
    false,
    null,
    null
  )
  const forkOwner = new Owner('fork-owner', 'https://api.github.com', 2)
  const forkedGhRepo = new GitHubRepository(
    'repo',
    forkOwner,
    2,
    false,
    'https://github.com/fork-owner/repo',
    'https://github.com/fork-owner/repo.git',
    true,
    false,
    null,
    parentGhRepo
  )
  return new Repository('/path/to/fork', 2, forkedGhRepo, false)
}

describe('Repository type guards', () => {
  describe('isRepositoryWithGitHubRepository', () => {
    it('returns false for a plain local repository', () => {
      const repo = createPlainRepository()
      assert.equal(isRepositoryWithGitHubRepository(repo), false)
    })

    it('returns true for a GitHub-connected repository', () => {
      const repo = createGitHubRepository()
      assert.equal(isRepositoryWithGitHubRepository(repo), true)
    })

    it('returns true for a forked GitHub repository', () => {
      const repo = createForkedGitHubRepository()
      assert.equal(isRepositoryWithGitHubRepository(repo), true)
    })
  })

  describe('isRepositoryWithForkedGitHubRepository', () => {
    it('returns false for a plain local repository', () => {
      const repo = createPlainRepository()
      assert.equal(isRepositoryWithForkedGitHubRepository(repo), false)
    })

    it('returns false for a non-forked GitHub repository', () => {
      const repo = createGitHubRepository()
      assert.equal(isRepositoryWithForkedGitHubRepository(repo), false)
    })

    it('returns true for a forked GitHub repository', () => {
      const repo = createForkedGitHubRepository()
      assert.equal(isRepositoryWithForkedGitHubRepository(repo), true)
    })
  })

  describe('getGitHubHtmlUrl', () => {
    it('returns null for a plain local repository', () => {
      const repo = createPlainRepository()
      assert.equal(getGitHubHtmlUrl(repo), null)
    })

    it('returns the HTML URL for a GitHub repository', () => {
      const repo = createGitHubRepository()
      const url = getGitHubHtmlUrl(repo)
      assert.equal(url, 'https://github.com/owner/repo')
    })
  })

  describe('isForkedRepositoryContributingToParent', () => {
    it('returns false for a plain local repository', () => {
      const repo = createPlainRepository()
      assert.equal(isForkedRepositoryContributingToParent(repo), false)
    })

    it('returns false for a non-forked GitHub repository', () => {
      const repo = createGitHubRepository()
      assert.equal(isForkedRepositoryContributingToParent(repo), false)
    })

    it('returns true for a forked repository with default settings', () => {
      const repo = createForkedGitHubRepository()
      // Default fork contribution target is Parent
      assert.equal(isForkedRepositoryContributingToParent(repo), true)
    })
  })
})
