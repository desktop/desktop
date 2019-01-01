import { groupRepositories } from '../../src/ui/repositories-list/group-repositories'
import { Repository, ILocalRepositoryState } from '../../src/models/repository'
import { GitHubRepository } from '../../src/models/github-repository'
import { Owner } from '../../src/models/owner'
import { getDotComAPIEndpoint } from '../../src/lib/api'
import { CloningRepository } from '../../src/models/cloning-repository'

describe('repository list grouping', () => {
  const repositories: Array<Repository | CloningRepository> = [
    new Repository('repo1', 1, null, false),
    new Repository(
      'repo2',
      2,
      new GitHubRepository(
        'my-repo2',
        new Owner('', getDotComAPIEndpoint(), null),
        1
      ),
      false
    ),
    new Repository(
      'repo3',
      3,
      new GitHubRepository('my-repo3', new Owner('', '', null), 1),
      false
    ),
  ]

  const cache = new Map<number, ILocalRepositoryState>()

  it('groups repositories by GitHub/Enterprise/Other', () => {
    const grouped = groupRepositories(repositories, cache)
    expect(grouped).toHaveLength(3)

    expect(grouped[0].identifier).toBe('github')
    expect(grouped[0].items).toHaveLength(1)

    let item = grouped[0].items[0]
    expect(item.repository.path).toBe('repo2')

    expect(grouped[1].identifier).toBe('enterprise')
    expect(grouped[1].items).toHaveLength(1)

    item = grouped[1].items[0]
    expect(item.repository.path).toBe('repo3')

    expect(grouped[2].identifier).toBe('other')
    expect(grouped[2].items).toHaveLength(1)

    item = grouped[2].items[0]
    expect(item.repository.path).toBe('repo1')
  })

  it('sorts repositories alphabetically within each group', () => {
    const repoA = new Repository('a', 1, null, false)
    const repoB = new Repository(
      'b',
      2,
      new GitHubRepository('b', new Owner('', getDotComAPIEndpoint(), null), 1),
      false
    )
    const repoC = new Repository('c', 2, null, false)
    const repoD = new Repository(
      'd',
      2,
      new GitHubRepository('d', new Owner('', getDotComAPIEndpoint(), null), 1),
      false
    )
    const repoZ = new Repository('z', 3, null, false)

    const grouped = groupRepositories(
      [repoC, repoB, repoZ, repoD, repoA],
      cache
    )
    expect(grouped).toHaveLength(2)

    expect(grouped[0].identifier).toBe('github')
    expect(grouped[0].items).toHaveLength(2)

    let items = grouped[0].items
    expect(items[0].repository.path).toBe('b')
    expect(items[1].repository.path).toBe('d')

    expect(grouped[1].identifier).toBe('other')
    expect(grouped[1].items).toHaveLength(3)

    items = grouped[1].items
    expect(items[0].repository.path).toBe('a')
    expect(items[1].repository.path).toBe('c')
    expect(items[2].repository.path).toBe('z')
  })

  it('marks repositories for disambiguation if they have the same name', () => {
    const repoA = new Repository(
      'repo',
      1,
      new GitHubRepository(
        'repo',
        new Owner('user1', getDotComAPIEndpoint(), null),
        1
      ),
      false
    )
    const repoB = new Repository(
      'cool-repo',
      2,
      new GitHubRepository(
        'cool-repo',
        new Owner('user2', getDotComAPIEndpoint(), null),
        2
      ),
      false
    )
    const repoC = new Repository(
      'repo',
      2,
      new GitHubRepository(
        'repo',
        new Owner('user2', getDotComAPIEndpoint(), null),
        2
      ),
      false
    )

    const grouped = groupRepositories([repoA, repoB, repoC], cache)
    expect(grouped).toHaveLength(1)

    expect(grouped[0].identifier).toBe('github')
    expect(grouped[0].items).toHaveLength(3)

    const items = grouped[0].items
    expect(items[0].text[0]).toBe('cool-repo')
    expect(items[0].needsDisambiguation).toBeFalsy()

    expect(items[1].text[0]).toBe('repo')
    expect(items[1].needsDisambiguation).toBeTruthy()

    expect(items[2].text[0]).toBe('repo')
    expect(items[2].needsDisambiguation).toBeTruthy()
  })
})
