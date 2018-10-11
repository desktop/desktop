import { expect } from 'chai'

import { OcticonSymbol, iconForRepository } from '../../src/ui/octicons'
import { CloningRepository } from '../../src/models/cloning-repository'
import { Repository } from '../../src/models/repository'
import { GitHubRepository } from '../../src/models/github-repository'

function getTestRepository(
  isPrivate: boolean,
  isFork: boolean = false
): GitHubRepository {
  return {
    dbID: 1,
    name: 'some-repo',
    owner: {
      endpoint: 'https://api.github.com',
      login: 'shiftkey',
      hash: '',
      id: null,
    },
    endpoint: 'https://api.github.com',
    fullName: 'shiftkey/some-repo',
    private: isPrivate,
    fork: isFork,
    cloneURL: 'https://github.com/shiftkey/some-repo.git',
    htmlURL: 'https://github.com/shiftkey/some-repo',
    defaultBranch: 'master',
    hash: '',
    parent: null,
  }
}

describe('octicon/iconForRepository', () => {
  it('shows download icon for cloning repository', () => {
    const repository = new CloningRepository(
      'C:/some/path/to/repo',
      'https://github.com/desktop/desktop'
    )
    const icon = iconForRepository(repository)
    expect(icon).to.deep.equal(OcticonSymbol.desktopDownload)
  })

  it('shows computer icon for non-GitHub repository', () => {
    const repository = new Repository('C:/some/path/to/repo', 1, null, false)
    const icon = iconForRepository(repository)
    expect(icon).to.deep.equal(OcticonSymbol.deviceDesktop)
  })

  it('shows repo icon for public GitHub repository', () => {
    const gitHubRepository = getTestRepository(false)
    const repository = new Repository(
      'C:/some/path/to/repo',
      1,
      gitHubRepository,
      false
    )
    const icon = iconForRepository(repository)
    expect(icon).to.deep.equal(OcticonSymbol.repo)
  })

  it('shows lock icon for public GitHub repository', () => {
    const gitHubRepository = getTestRepository(true)
    const repository = new Repository(
      'C:/some/path/to/repo',
      1,
      gitHubRepository,
      false
    )
    const icon = iconForRepository(repository)
    expect(icon).to.deep.equal(OcticonSymbol.lock)
  })

  it('shows fork icon for forked GitHub repository', () => {
    const gitHubRepository = getTestRepository(false, true)
    const repository = new Repository(
      'C:/some/path/to/repo',
      1,
      gitHubRepository,
      false
    )
    const icon = iconForRepository(repository)
    expect(icon).to.deep.equal(OcticonSymbol.repoForked)
  })
})
