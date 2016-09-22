import * as chai from 'chai'
const expect = chai.expect

import { groupRepositories } from '../src/ui/repositories-list/group-repositories'
import { Repository } from '../src/models/repository'
import { GitHubRepository } from '../src/models/github-repository'
import Owner from '../src/models/owner'
import { getDotComAPIEndpoint } from '../src/lib/api'
import { CloningRepository } from '../src/lib/dispatcher'

describe('Repository grouping', () => {
  const repositories: Array<Repository | CloningRepository> = [
    new Repository('repo1', 1),
    new Repository('repo2', 2, new GitHubRepository('my-repo2', new Owner('', getDotComAPIEndpoint()))),
    new Repository('repo3', 3, new GitHubRepository('my-repo3', new Owner('', ''))),
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

  it('sorts repositories alphabetically within each group', () => {
    const repoA = new Repository('a', 1)
    const repoB = new Repository('b', 2, new GitHubRepository('b', new Owner('', getDotComAPIEndpoint())))
    const repoC = new Repository('c', 2)
    const repoD = new Repository('d', 2, new GitHubRepository('d', new Owner('', getDotComAPIEndpoint())))
    const repoZ = new Repository('z', 3)

    const grouped = groupRepositories([ repoC, repoB, repoZ, repoD, repoA ])

    let i = 0
    expect(grouped[i].kind).to.equal('label')
    expect((grouped[i] as any).label).to.equal('GitHub')
    i++

    expect(grouped[i].kind).to.equal('repository')
    expect((grouped[i] as any).repository.path).to.equal('b')
    i++

    expect(grouped[i].kind).to.equal('repository')
    expect((grouped[i] as any).repository.path).to.equal('d')
    i++

    expect(grouped[i].kind).to.equal('label')
    expect((grouped[i] as any).label).to.equal('Other')
    i++

    expect(grouped[i].kind).to.equal('repository')
    expect((grouped[i] as any).repository.path).to.equal('a')
    i++

    expect(grouped[i].kind).to.equal('repository')
    expect((grouped[i] as any).repository.path).to.equal('c')
    i++

    expect(grouped[i].kind).to.equal('repository')
    expect((grouped[i] as any).repository.path).to.equal('z')
    i++
  })
})
