import { OcticonSymbol, iconForRepository } from '../../src/ui/octicons'
import { CloningRepository } from '../../src/models/cloning-repository'
import { Repository } from '../../src/models/repository'
import { gitHubRepoFixture } from '../helpers/github-repo-builder'

describe('octicon/iconForRepository', () => {
  it('shows download icon for cloning repository', () => {
    const repository = new CloningRepository(
      'C:/some/path/to/repo',
      'https://github.com/desktop/desktop'
    )
    const icon = iconForRepository(repository)
    expect(icon).toEqual(OcticonSymbol.desktopDownload)
  })

  it('shows computer icon for non-GitHub repository', () => {
    const repository = new Repository('C:/some/path/to/repo', 1, null, false)
    const icon = iconForRepository(repository)
    expect(icon).toEqual(OcticonSymbol.deviceDesktop)
  })

  it('shows repo icon for public GitHub repository', () => {
    const gitHubRepository = gitHubRepoFixture({
      owner: 'me',
      name: 'my-repo',
      isPrivate: false,
    })
    const repository = new Repository(
      'C:/some/path/to/repo',
      1,
      gitHubRepository,
      false
    )
    const icon = iconForRepository(repository)
    expect(icon).toEqual(OcticonSymbol.repo)
  })

  it('shows lock icon for private GitHub repository', () => {
    const gitHubRepository = gitHubRepoFixture({
      owner: 'me',
      name: 'my-repo',
      isPrivate: true,
    })
    const repository = new Repository(
      'C:/some/path/to/repo',
      1,
      gitHubRepository,
      false
    )
    const icon = iconForRepository(repository)
    expect(icon).toEqual(OcticonSymbol.lock)
  })

  it('shows fork icon for forked GitHub repository', () => {
    const gitHubRepository = gitHubRepoFixture({
      owner: 'me',
      name: 'my-repo',
      isPrivate: false,
      parent: gitHubRepoFixture({ owner: 'you', name: 'my-repo' }),
    })
    const repository = new Repository(
      'C:/some/path/to/repo',
      1,
      gitHubRepository,
      false
    )
    const icon = iconForRepository(repository)
    expect(icon).toEqual(OcticonSymbol.repoForked)
  })
})
