import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  getGroupKey,
  groupRepositories,
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

  function assignedRepository(
    id: number,
    login: string | null,
    endpoint: string | null = 'https://api.github.com',
    owner = 'acme'
  ) {
    return new Repository(
      `repo-${id}`,
      id,
      endpoint === null
        ? null
        : gitHubRepoFixture({ owner, name: `repo-${id}`, endpoint }),
      false,
      null,
      undefined,
      false,
      undefined,
      undefined,
      login
    )
  }

  it('splits an owner by retained account assignments, including signed-out and unassociated repositories', () => {
    const alice = assignedRepository(10, 'alice')
    const bob = assignedRepository(11, 'bob')
    const unassociated = assignedRepository(12, null)
    const grouped = groupRepositories([alice, bob, unassociated], cache, [])

    assert.deepStrictEqual(
      grouped.map(group => group.items.map(item => item.repository.id)),
      [[10], [11], [12]]
    )
    assert.strictEqual(
      new Set(grouped.map(g => getGroupKey(g.identifier))).size,
      3
    )
  })

  it('counts signed-in accounts per endpoint even when they have no repositories', () => {
    const endpoint = 'https://api.github.com'
    const alice = assignedRepository(10, 'alice')
    const unassociated = assignedRepository(11, null)
    const enterprise = assignedRepository(
      12,
      'alice',
      'https://ghe.example/api/v3'
    )
    const grouped = groupRepositories(
      [alice, unassociated, enterprise],
      cache,
      [],
      [
        { endpoint, login: 'alice' },
        { endpoint, login: 'bob' },
      ]
    )

    assert.deepStrictEqual(
      grouped.map(group => group.items.map(item => item.repository.id)),
      [[10], [11], [12]]
    )
  })

  it('keeps single-identity groups unchanged and compares retained logins case-insensitively', () => {
    const alice = assignedRepository(10, 'Alice')
    const sameAccount = assignedRepository(11, 'ALICE')
    const unassociated = assignedRepository(12, null)
    const grouped = groupRepositories(
      [alice, sameAccount, unassociated],
      cache,
      [],
      [{ endpoint: 'https://api.github.com', login: 'alice' }]
    )

    assert.strictEqual(grouped.length, 1)
    assert.strictEqual(getGroupKey(grouped[0].identifier), '1:dotcom:acme')

    const split = groupRepositories(
      [alice, sameAccount, unassociated, assignedRepository(13, 'bob')],
      cache,
      []
    )
    assert.deepStrictEqual(
      split.map(group => group.items.map(item => item.repository.id)),
      [[10, 11], [13], [12]]
    )
  })

  it('subdivides enterprise hostname groups by account without introducing owner groups', () => {
    const endpoint = 'https://ghe.example/api/v3'
    const grouped = groupRepositories(
      [
        assignedRepository(10, 'alice', endpoint, 'first-org'),
        assignedRepository(11, 'alice', endpoint, 'second-org'),
        assignedRepository(12, 'bob', endpoint),
        assignedRepository(13, null, endpoint),
      ],
      cache,
      []
    )

    assert.deepStrictEqual(
      grouped.map(group => group.items.map(item => item.repository.id)),
      [[10, 11], [12], [13]]
    )
    for (const group of grouped) {
      assert.strictEqual(group.identifier.kind, 'enterprise')
    }
  })

  it('groups local-only repositories by their stored login and keeps unassociated and cloning repositories in Other', () => {
    const local = assignedRepository(10, null, null)
    const cloning = new CloningRepository(
      '/cloning',
      'https://github.com/acme/cloning.git'
    )
    const grouped = groupRepositories(
      [
        local,
        assignedRepository(11, 'alice', null),
        assignedRepository(12, 'bob', null),
        assignedRepository(13, 'ALICE', null),
        cloning,
      ],
      cache,
      []
    )

    assert.deepStrictEqual(
      grouped.map(group => group.items.map(item => item.repository.id)),
      [[cloning.id, 10], [11, 13], [12]]
    )
  })

  it('keeps owner ordering primary when adding account qualifiers', () => {
    const grouped = groupRepositories(
      [
        assignedRepository(10, 'alice'),
        assignedRepository(11, 'bob'),
        assignedRepository(12, 'alice', 'https://api.github.com', 'acme-tools'),
      ],
      cache,
      []
    )

    assert.deepStrictEqual(
      grouped.map(group => group.items.map(item => item.repository.id)),
      [[10], [11], [12]]
    )
  })

  it('preserves Recent while splitting the ordinary groups by account', () => {
    const repositories = Array.from({ length: 8 }, (_, index) =>
      assignedRepository(index, index % 2 === 0 ? 'alice' : 'bob')
    )
    const grouped = groupRepositories(repositories, cache, [0, 1])

    assert.deepStrictEqual(
      grouped.map(group => group.items.map(item => item.repository.id)),
      [
        [0, 1],
        [0, 2, 4, 6],
        [1, 3, 5, 7],
      ]
    )
    assert.strictEqual(getGroupKey(grouped[0].identifier), '0:recent')
  })

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
})
