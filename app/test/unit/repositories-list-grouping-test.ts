import { describe, it } from 'node:test'
import assert from 'node:assert'
import { groupRepositories } from '../../src/ui/repositories-list/group-repositories'
import { Repository, ILocalRepositoryState } from '../../src/models/repository'
import { CloningRepository } from '../../src/models/cloning-repository'
import { gitHubRepoFixture } from '../helpers/github-repo-builder'
import { Account } from '../../src/models/account'
import { getGroupKey } from '../../src/ui/repositories-list/group-repositories'
import { RepositoriesList } from '../../src/ui/repositories-list/repositories-list'

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

  it('preserves owner headings for a single retained identity', () => {
    const account = new Account(
      'joan',
      'https://api.github.com',
      '',
      [],
      '',
      1,
      ''
    )
    const repo = associatedRepository(1, account)
    const groups = groupRepositories([repo], cache, [], [account])

    assert.equal(groups.length, 1)
    assert.equal(groups[0].identifier.kind, 'dotcom')
    assert.equal(getGroupKey(groups[0].identifier), '1:dotcom:team')
  })

  it('separates accounts and unassociated repositories in the same organization', () => {
    const first = new Account(
      'joan',
      'https://api.github.com',
      '',
      [],
      '',
      1,
      ''
    )
    const second = new Account(
      'alex',
      'https://api.github.com',
      'token',
      [],
      '',
      2,
      ''
    )
    const groups = groupRepositories(
      [
        associatedRepository(1, first),
        associatedRepository(2, second),
        associatedRepository(3, null),
      ],
      cache,
      [],
      [first, second]
    )

    assert.equal(groups.length, 3)
    assert.deepEqual(
      groups.map(group => group.identifier.kind),
      ['dotcom', 'dotcom', 'dotcom']
    )
    assert.deepEqual(
      groups.map(group =>
        group.identifier.kind === 'dotcom'
          ? group.identifier.accountLabel
          : undefined
      ),
      ['joan', 'alex', 'Unassociated']
    )
    assert.deepEqual(
      groups.map(group => group.items[0].repository.id),
      [1, 2, 3]
    )
  })

  it('names the associated account in local-only groups while keeping unassociated repositories under Other', () => {
    const first = new Account(
      'wilmartin_microsoft',
      'https://api.github.com',
      'token',
      [],
      '',
      1,
      ''
    )
    const second = new Account('personal', first.endpoint, '', [], '', 2, '')
    const local = (id: number, account: Account | null | undefined) =>
      new Repository(
        `repo-${id}`,
        id,
        null,
        false,
        null,
        {},
        false,
        undefined,
        undefined,
        account === undefined
          ? undefined
          : account === null
          ? null
          : { endpoint: account.endpoint, id: account.id }
      )
    const groups = groupRepositories(
      [local(1, first), local(2, second), local(3, null), local(4, undefined)],
      cache,
      [],
      [first, second]
    )

    assert.equal(groups.length, 3)
    assert.deepEqual(
      groups.map(group => group.items.map(item => item.repository.id)),
      [[3, 4], [1], [2]]
    )
    assert.deepEqual(
      groups.map(group =>
        RepositoriesList.prototype['getGroupLabel'](group.identifier)
      ),
      ['Other', 'Other — @wilmartin_microsoft', 'Other — @personal']
    )
    assert.equal(
      new Set(groups.map(group => getGroupKey(group.identifier))).size,
      3
    )
  })
})

function associatedRepository(id: number, account: Account | null) {
  return new Repository(
    `repo-${id}`,
    id,
    gitHubRepoFixture({ owner: 'team', name: `repo-${id}` }),
    false,
    null,
    {},
    false,
    undefined,
    undefined,
    account === null ? null : { endpoint: account.endpoint, id: account.id }
  )
}
