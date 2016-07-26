import * as chai from 'chai'
const expect = chai.expect

import { groupRepositories } from '../src/ui/repositories-list/group-repositories'
import Repository from '../src/models/repository'
import GitHubRepository from '../src/models/github-repository'
import Owner from '../src/models/owner'
import { getDotComAPIEndpoint } from '../src/lib/api'

describe('Repository grouping', () => {
  const repositories = [
    new Repository('repo1', null),
    new Repository('repo2', new GitHubRepository('my-repo2', new Owner('', getDotComAPIEndpoint()))),
    new Repository('repo3', new GitHubRepository('my-repo3', new Owner('', ''))),
  ]

  it('groups repositories by GitHub/Enterprise/Other', () => {
    const grouped = groupRepositories(repositories)
    expect(grouped.length).to.equal(repositories.length + 3)

    let i = 0
    expect(grouped[i].kind).to.equal('label')
    expect((grouped[i] as any).label).to.equal('GitHub')
    i++

    expect(grouped[i].kind).to.equal('repository')
    expect((grouped[i] as any).repository.path).to.equal('repo2')
    i++

    expect(grouped[i].kind).to.equal('label')
    expect((grouped[i] as any).label).to.equal('Enterprise')
    i++

    expect(grouped[i].kind).to.equal('repository')
    expect((grouped[i] as any).repository.path).to.equal('repo3')
    i++

    expect(grouped[i].kind).to.equal('label')
    expect((grouped[i] as any).label).to.equal('Other')
    i++

    expect(grouped[i].kind).to.equal('repository')
    expect((grouped[i] as any).repository.path).to.equal('repo1')
  })
})
