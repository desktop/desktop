import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  groupRepositories,
  hasRepositoryListItemIndicator,
} from '../../src/ui/repositories-list/group-repositories'
import { Repository, ILocalRepositoryState } from '../../src/models/repository'
import { CloningRepository } from '../../src/models/cloning-repository'
import { gitHubRepoFixture } from '../helpers/github-repo-builder'

describe('repository list grouping', () => {
  const repositories: Array<Repository | CloningRepository> = [
    new Repository('repo1', 1, null, false),
    new Repository(
      'repo2',
      2,
      gitHubRepoFixture({ owner: 'me', name: 'my-repo2' }),
      false
    ),
    new Repository(
      'repo3',
      3,
      gitHubRepoFixture({
        owner: '',
        name: 'my-repo3',
        endpoint: 'https://github.big-corp.com/api/v3',
      }),
      false
    ),
  ]

  const cache = new Map<number, ILocalRepositoryState>()

  it('groups repositories by owners/Enterprise/Other', () => {
    const grouped = groupRepositories(repositories, cache, [])
    assert.equal(grouped.length, 3)

    assert.equal(grouped[0].identifier.kind, 'dotcom')
    assert.equal((grouped[0].identifier as any).owner.login, 'me')
    assert.equal(grouped[0].items.length, 1)

    let item = grouped[0].items[0]
    assert.equal(item.repository.path, 'repo2')

    assert.equal(grouped[1].identifier.kind, 'enterprise')
    assert.equal(grouped[1].items.length, 1)

    item = grouped[1].items[0]
    assert.equal(item.repository.path, 'repo3')

    assert.equal(grouped[2].identifier.kind, 'other')
    assert.equal(grouped[2].items.length, 1)

    item = grouped[2].items[0]
    assert.equal(item.repository.path, 'repo1')
  })

  it('sorts repositories alphabetically within each group', () => {
    const repoA = new Repository('a', 1, null, false)
    const repoB = new Repository(
      'b',
      2,
      gitHubRepoFixture({ owner: 'me', name: 'b' }),
      false
    )
    const repoC = new Repository('c', 2, null, false)
    const repoD = new Repository(
      'd',
      2,
      gitHubRepoFixture({ owner: 'me', name: 'd' }),
      false
    )
    const repoZ = new Repository('z', 3, null, false)

    const grouped = groupRepositories(
      [repoC, repoB, repoZ, repoD, repoA],
      cache,
      []
    )
    assert.equal(grouped.length, 2)

    assert.equal(grouped[0].identifier.kind, 'dotcom')
    assert.equal((grouped[0].identifier as any).owner.login, 'me')
    assert.equal(grouped[0].items.length, 2)

    let items = grouped[0].items
    assert.equal(items[0].repository.path, 'b')
    assert.equal(items[1].repository.path, 'd')

    assert.equal(grouped[1].identifier.kind, 'other')
    assert.equal(grouped[1].items.length, 3)

    items = grouped[1].items
    assert.equal(items[0].repository.path, 'a')
    assert.equal(items[1].repository.path, 'c')
    assert.equal(items[2].repository.path, 'z')
  })

  it('only disambiguates Enterprise repositories', () => {
    const repoA = new Repository(
      'repo',
      1,
      gitHubRepoFixture({ owner: 'user1', name: 'repo' }),
      false
    )
    const repoB = new Repository(
      'repo',
      2,
      gitHubRepoFixture({ owner: 'user2', name: 'repo' }),
      false
    )
    const repoC = new Repository(
      'enterprise-repo',
      3,
      gitHubRepoFixture({
        owner: 'business',
        name: 'enterprise-repo',
        endpoint: 'https://ghe.io/api/v3',
      }),
      false
    )
    const repoD = new Repository(
      'enterprise-repo',
      3,
      gitHubRepoFixture({
        owner: 'silliness',
        name: 'enterprise-repo',
        endpoint: 'https://ghe.io/api/v3',
      }),
      false
    )

    const grouped = groupRepositories([repoA, repoB, repoC, repoD], cache, [])
    assert.equal(grouped.length, 3)

    assert.equal(grouped[0].identifier.kind, 'dotcom')
    assert.equal((grouped[0].identifier as any).owner.login, 'user1')
    assert.equal(grouped[0].items.length, 1)

    assert.equal(grouped[1].identifier.kind, 'dotcom')
    assert.equal((grouped[1].identifier as any).owner.login, 'user2')
    assert.equal(grouped[1].items.length, 1)

    assert.equal(grouped[2].identifier.kind, 'enterprise')
    assert.equal(grouped[2].items.length, 2)

    assert.equal(grouped[0].items[0].text[0], 'repo')
    assert(!grouped[0].items[0].needsDisambiguation)

    assert.equal(grouped[1].items[0].text[0], 'repo')
    assert(!grouped[1].items[0].needsDisambiguation)

    assert.equal(grouped[2].items[0].text[0], 'enterprise-repo')
    assert(grouped[2].items[0].needsDisambiguation)

    assert.equal(grouped[2].items[1].text[0], 'enterprise-repo')
    assert(grouped[2].items[1].needsDisambiguation)
  })

  it('filters to repositories with local changes or ahead/behind commits', () => {
    const cleanRepo = new Repository('clean', 1, null, false)
    const changedRepo = new Repository('changed', 2, null, false)
    const aheadRepo = new Repository('ahead', 3, null, false)
    const behindRepo = new Repository('behind', 4, null, false)
    const divergedRepo = new Repository('diverged', 5, null, false)

    const repositoryStates = new Map<number, ILocalRepositoryState>([
      [1, { aheadBehind: { ahead: 0, behind: 0 }, changedFilesCount: 0 }],
      [2, { aheadBehind: { ahead: 0, behind: 0 }, changedFilesCount: 3 }],
      [3, { aheadBehind: { ahead: 2, behind: 0 }, changedFilesCount: 0 }],
      [4, { aheadBehind: { ahead: 0, behind: 1 }, changedFilesCount: 0 }],
      [5, { aheadBehind: { ahead: 1, behind: 1 }, changedFilesCount: 0 }],
    ])

    const grouped = groupRepositories(
      [cleanRepo, changedRepo, aheadRepo, behindRepo, divergedRepo],
      repositoryStates,
      [],
      true
    )

    assert.equal(grouped.length, 1)
    assert.deepStrictEqual(
      grouped[0].items.map(item => item.repository.path),
      ['ahead', 'behind', 'changed', 'diverged']
    )
  })

  it('uses the same status signal as repository list indicators', () => {
    assert.equal(
      hasRepositoryListItemIndicator({
        aheadBehind: { ahead: 0, behind: 0 },
        changedFilesCount: 0,
      }),
      false
    )
    assert.equal(
      hasRepositoryListItemIndicator({
        aheadBehind: null,
        changedFilesCount: 1,
      }),
      true
    )
    assert.equal(
      hasRepositoryListItemIndicator({
        aheadBehind: { ahead: 1, behind: 0 },
        changedFilesCount: 0,
      }),
      true
    )
    assert.equal(
      hasRepositoryListItemIndicator({
        aheadBehind: { ahead: 0, behind: 1 },
        changedFilesCount: 0,
      }),
      true
    )
  })
})
