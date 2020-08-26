import {
  groupRepositories,
  KnownRepositoryGroup,
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
        endpoint: 'github.big-corp.com',
      }),
      false
    ),
  ]

  const cache = new Map<number, ILocalRepositoryState>()

  it('groups repositories by owners/Enterprise/Other', () => {
    const grouped = groupRepositories(repositories, cache)
    expect(grouped).toHaveLength(3)

    expect(grouped[0].identifier).toBe('me')
    expect(grouped[0].items).toHaveLength(1)

    let item = grouped[0].items[0]
    expect(item.repository.path).toBe('repo2')

    expect(grouped[1].identifier).toBe(KnownRepositoryGroup.Enterprise)
    expect(grouped[1].items).toHaveLength(1)

    item = grouped[1].items[0]
    expect(item.repository.path).toBe('repo3')

    expect(grouped[2].identifier).toBe(KnownRepositoryGroup.NonGitHub)
    expect(grouped[2].items).toHaveLength(1)

    item = grouped[2].items[0]
    expect(item.repository.path).toBe('repo1')
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
      cache
    )
    expect(grouped).toHaveLength(2)

    expect(grouped[0].identifier).toBe('me')
    expect(grouped[0].items).toHaveLength(2)

    let items = grouped[0].items
    expect(items[0].repository.path).toBe('b')
    expect(items[1].repository.path).toBe('d')

    expect(grouped[1].identifier).toBe(KnownRepositoryGroup.NonGitHub)
    expect(grouped[1].items).toHaveLength(3)

    items = grouped[1].items
    expect(items[0].repository.path).toBe('a')
    expect(items[1].repository.path).toBe('c')
    expect(items[2].repository.path).toBe('z')
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
        endpoint: '',
      }),
      false
    )
    const repoD = new Repository(
      'enterprise-repo',
      3,
      gitHubRepoFixture({
        owner: 'silliness',
        name: 'enterprise-repo',
        endpoint: '',
      }),
      false
    )

    const grouped = groupRepositories([repoA, repoB, repoC, repoD], cache)
    expect(grouped).toHaveLength(3)

    expect(grouped[0].identifier).toBe('user1')
    expect(grouped[0].items).toHaveLength(1)

    expect(grouped[1].identifier).toBe('user2')
    expect(grouped[1].items).toHaveLength(1)

    expect(grouped[2].identifier).toBe(KnownRepositoryGroup.Enterprise)
    expect(grouped[2].items).toHaveLength(2)

    expect(grouped[0].items[0].text[0]).toBe('repo')
    expect(grouped[0].items[0].needsDisambiguation).toBe(false)

    expect(grouped[1].items[0].text[0]).toBe('repo')
    expect(grouped[1].items[0].needsDisambiguation).toBe(false)

    expect(grouped[2].items[0].text[0]).toBe('enterprise-repo')
    expect(grouped[2].items[0].needsDisambiguation).toBe(true)

    expect(grouped[2].items[1].text[0]).toBe('enterprise-repo')
    expect(grouped[2].items[1].needsDisambiguation).toBe(true)
  })
})
