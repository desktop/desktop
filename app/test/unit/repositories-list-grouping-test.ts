import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  groupRepositories,
  getRepositoryGroupNames,
  getGroupLabel,
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

  describe('custom groups', () => {
    const grouped = (
      path: string,
      id: number,
      group: string | null,
      owner?: string
    ) =>
      new Repository(
        path,
        id,
        owner ? gitHubRepoFixture({ owner, name: path }) : null,
        false,
        null,
        {},
        false,
        undefined,
        undefined,
        group
      )

    it('moves a grouped repository out of its owner section', () => {
      const repoA = grouped('a', 1, 'Work', 'me')
      const repoB = grouped('b', 2, null, 'me')

      const groups = groupRepositories([repoA, repoB], cache, [])
      assert.deepEqual(groups[0].identifier, { kind: 'custom', name: 'Work' })
      assert.equal(groups[1].identifier.kind, 'dotcom')
      assert.deepEqual(
        groups.map(g => g.items.map(i => i.repository.id)),
        [[1], [2]]
      )
    })

    it('keeps grouped repositories in the Recent section', () => {
      const repos = [1, 2, 3, 4, 5, 6, 7, 8].map(id =>
        grouped(`r${id}`, id, id === 1 ? 'Work' : null)
      )

      const groups = groupRepositories(repos, cache, [1])
      assert.deepEqual(
        groups.map(g => g.identifier.kind),
        ['recent', 'custom', 'other']
      )
      assert.deepEqual(
        groups[0].items.map(i => i.repository.id),
        [1]
      )
      assert.deepEqual(
        groups[1].items.map(i => i.repository.id),
        [1]
      )
    })

    it('sorts custom sections after Recent and before owners, alphabetically', () => {
      const repos = [
        grouped('a', 1, null, 'aaa'),
        grouped('b', 2, 'zeta'),
        grouped('c', 3, 'Alpha'),
        grouped('d', 4, null),
        ...[5, 6, 7, 8].map(id => grouped(`r${id}`, id, null)),
      ]

      const groups = groupRepositories(repos, cache, [4])
      assert.deepEqual(
        groups.map(g =>
          g.identifier.kind === 'custom' ? g.identifier.name : g.identifier.kind
        ),
        ['recent', 'Alpha', 'zeta', 'dotcom', 'other']
      )
    })

    it('orders custom sections by the stored order, then alphabetically', () => {
      const repos = [
        grouped('a', 1, null, 'aaa'),
        grouped('b', 2, 'Zeta'),
        grouped('c', 3, 'alpha'),
        grouped('d', 4, 'Beta'),
        grouped('e', 5, 'Gamma'),
        grouped('f', 6, 'delta'),
        ...[7, 8].map(id => grouped(`r${id}`, id, null)),
      ]

      const groups = groupRepositories(repos, cache, [4], new Set(), [
        'gamma',
        'missing',
        'zeta',
      ])
      assert.deepEqual(
        groups.map(g =>
          g.identifier.kind === 'custom' ? g.identifier.name : g.identifier.kind
        ),
        ['recent', 'Gamma', 'Zeta', 'alpha', 'Beta', 'delta', 'dotcom', 'other']
      )
    })

    it('disambiguates duplicate names within a custom group', () => {
      const groups = groupRepositories(
        [
          grouped('API', 1, 'Work', 'one'),
          grouped('API', 2, 'Work', 'two'),
          grouped('APP', 3, 'Work', 'one'),
        ],
        cache,
        []
      )

      assert.deepEqual(
        groups[0].items.map(i => i.needsDisambiguation),
        [true, true, false]
      )
    })
  })

  it('lists distinct group names alphabetically', () => {
    const withGroup = (id: number, group: string | null) =>
      new Repository(
        `r${id}`,
        id,
        null,
        false,
        null,
        {},
        false,
        undefined,
        undefined,
        group
      )

    assert.deepEqual(
      getRepositoryGroupNames([
        withGroup(1, 'zeta'),
        withGroup(2, null),
        withGroup(3, 'Alpha'),
        withGroup(4, 'alpha'),
        new CloningRepository('c', 'https://example.com/c.git'),
      ]),
      ['Alpha', 'zeta']
    )
  })

  it('marks groups collapsed from the stored group keys', () => {
    const grouped = groupRepositories(
      repositories,
      cache,
      [],
      new Set(['3:other'])
    )
    assert.deepEqual(
      grouped.map(g => [g.identifier.kind, g.collapsed]),
      [
        ['dotcom', false],
        ['enterprise', false],
        ['other', true],
      ]
    )
  })

  describe('owner aliases', () => {
    const repo = (id: number, owner: string, ownerAlias?: string) =>
      new Repository(
        `r${id}`,
        id,
        gitHubRepoFixture({ owner, ownerAlias, name: `r${id}` }),
        false
      )

    it('labels owner sections with the alias and login', () => {
      const [aliased, plain] = groupRepositories(
        [repo(1, 'acme', 'Acme Corp'), repo(2, 'zeta')],
        cache,
        []
      )
      assert.equal(getGroupLabel(aliased.identifier), 'Acme Corp (acme)')
      assert.equal(getGroupLabel(plain.identifier), 'zeta')
    })

    it('sorts owner sections by login, not alias', () => {
      const grouped = groupRepositories(
        [repo(1, 'bbb', 'Aaa'), repo(2, 'aaa', 'Zzz')],
        cache,
        []
      )
      assert.deepEqual(
        grouped.map(g => getGroupLabel(g.identifier)),
        ['Zzz (aaa)', 'Aaa (bbb)']
      )
    })
  })
})
