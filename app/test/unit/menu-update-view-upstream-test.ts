import { describe, it } from 'node:test'
import assert from 'node:assert'
import { isRepositoryForkWithUpstreamOnGitHub } from '../../src/lib/menu-update'
import { Repository } from '../../src/models/repository'
import { CloningRepository } from '../../src/models/cloning-repository'
import { gitHubRepoFixture } from '../helpers/github-repo-builder'

describe('isRepositoryForkWithUpstreamOnGitHub', () => {
  it('returns false for a repository not hosted on GitHub', () => {
    const repository = new Repository('/some/path', -1, null, false)
    assert.equal(isRepositoryForkWithUpstreamOnGitHub(repository), false)
  })

  it('returns false for a GitHub repository without a parent', () => {
    const gitHubRepository = gitHubRepoFixture({
      owner: 'joelng25',
      name: 'portfolio',
    })
    const repository = new Repository('/some/path', -1, gitHubRepository, false)
    assert.equal(isRepositoryForkWithUpstreamOnGitHub(repository), false)
  })

  it('returns true for a fork with a parent repository', () => {
    const parent = gitHubRepoFixture({ owner: 'desktop', name: 'desktop' })
    const gitHubRepository = gitHubRepoFixture({
      owner: 'joelng25',
      name: 'desktop',
      parent,
    })
    const repository = new Repository('/some/path', -1, gitHubRepository, false)
    assert.equal(isRepositoryForkWithUpstreamOnGitHub(repository), true)
    assert.equal(
      gitHubRepository.parent?.htmlURL,
      'https://github.com/desktop/desktop'
    )
  })

  it('returns false for a repository that is still cloning', () => {
    const repository = new CloningRepository(
      '/some/path',
      'https://github.com/joelng25/desktop'
    )
    assert.equal(isRepositoryForkWithUpstreamOnGitHub(repository), false)
  })
})
