import { expect } from 'chai'

import { Repository, nameOf } from '../../src/models/repository'
import { GitHubRepository } from '../../src/models/github-repository'
import { Owner } from '../../src/models/owner'

const repoPath = '/some/cool/path'

describe('nameOf', () => {
  it('Returns the repo base path if there is no associated github metadata', () => {
    const repo = new Repository(repoPath, -1, null, false)

    const name = nameOf(repo)

    expect(name).to.equal('path')
  })

  it('Returns the name of the repo', () => {
    const ghRepo = new GitHubRepository(
      'name',
      new Owner('desktop', '', null),
      null
    )
    const repo = new Repository(repoPath, -1, ghRepo, false)

    const name = nameOf(repo)

    expect(name).to.equal('desktop/name')
  })
})
