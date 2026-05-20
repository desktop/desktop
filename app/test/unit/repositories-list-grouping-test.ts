import { describe, it } from 'node:test'
import assert from 'node:assert'
import { groupRepositories } from '../../src/ui/repositories-list/group-repositories'
import { Repository, ILocalRepositoryState } from '../../src/models/repository'
import { CloningRepository } from '../../src/models/cloning-repository'
import { Category } from '../../src/models/category'
import { gitHubRepoFixture } from '../helpers/github-repo-builder'

/** Build a repository with the given categoryId without listing every default arg. */
function repoWithCategory(
  path: string,
  id: number,
  categoryId: number | null,
  ghOwner?: string
) {
  return new Repository(
    path,
    id,
    ghOwner !== undefined
      ? gitHubRepoFixture({ owner: ghOwner, name: path })
      : null,
    false,
    null,
    {},
    false,
    undefined,
    categoryId
  )
}

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

  describe('categories', () => {
    const work = new Category(10, 'Work')
    const personal = new Category(20, 'Personal')

    it('puts a categorized repo under its category group, not its default bucket', () => {
      const dotcomNoCat = repoWithCategory('alpha', 1, null, 'me')
      const dotcomWithCat = repoWithCategory('beta', 2, work.id, 'me')

      const grouped = groupRepositories(
        [dotcomNoCat, dotcomWithCat],
        cache,
        [],
        [work]
      )

      const category = grouped.find(g => g.identifier.kind === 'category')
      const dotcom = grouped.find(g => g.identifier.kind === 'dotcom')

      assert.ok(category, 'expected a category group')
      assert.equal(category!.items.length, 1)
      assert.equal(category!.items[0].repository.path, 'beta')

      assert.ok(dotcom, 'expected a dotcom group for the uncategorized repo')
      assert.equal(dotcom!.items.length, 1)
      assert.equal(dotcom!.items[0].repository.path, 'alpha')
    })

    it('orders groups Recent → Category → dotcom → enterprise → Other', () => {
      // Need > 7 repos for the Recent group to materialize.
      const repos = [
        repoWithCategory('a', 1, work.id, 'me'),
        repoWithCategory('b', 2, null, 'me'),
        repoWithCategory('c', 3, null, 'me'),
        repoWithCategory('d', 4, null, 'me'),
        repoWithCategory('e', 5, null, 'me'),
        repoWithCategory('f', 6, null, 'me'),
        repoWithCategory('g', 7, null, 'me'),
        repoWithCategory('h', 8, null),
      ]

      const grouped = groupRepositories(repos, cache, [1], [work])
      const kinds = grouped.map(g => g.identifier.kind)
      assert.deepEqual(kinds, ['recent', 'category', 'dotcom', 'other'])
    })

    it('keeps duplicating categorized repos into Recent', () => {
      const repos = Array.from({ length: 8 }, (_, i) =>
        repoWithCategory(`r${i + 1}`, i + 1, i === 0 ? work.id : null, 'me')
      )
      const grouped = groupRepositories(repos, cache, [1], [work])

      const recent = grouped.find(g => g.identifier.kind === 'recent')
      const category = grouped.find(g => g.identifier.kind === 'category')
      assert.ok(recent && category)
      assert.equal(recent!.items.length, 1)
      assert.equal(recent!.items[0].repository.path, 'r1')
      assert.equal(category!.items[0].repository.path, 'r1')
    })

    it('renders an empty category group when no repos are assigned to it', () => {
      const grouped = groupRepositories([], cache, [], [work, personal])
      const categoryGroups = grouped.filter(
        g => g.identifier.kind === 'category'
      )
      assert.equal(categoryGroups.length, 2)
      for (const g of categoryGroups) {
        assert.equal(g.items.length, 0)
      }
    })

    it('falls back to the default bucket when categoryId references a missing category', () => {
      const orphaned = repoWithCategory('orphan', 1, 999, 'me')
      const grouped = groupRepositories([orphaned], cache, [], [])
      assert.equal(grouped.length, 1)
      assert.equal(grouped[0].identifier.kind, 'dotcom')
    })
  })
})
