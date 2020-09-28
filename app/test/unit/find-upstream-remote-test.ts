import {
  findUpstreamRemote,
  UpstreamRemoteName,
} from '../../src/lib/stores/helpers/find-upstream-remote'
import { GitHubRepository } from '../../src/models/github-repository'
import { Owner } from '../../src/models/owner'

describe('findUpstreamRemote', () => {
  it('finds the upstream', () => {
    const parent = new GitHubRepository(
      'github-release-stats',
      new Owner('somsubhra', 'https://api.github.com', null),
      null,
      false,
      'https://github.com/Somsubhra/github-release-stats',
      'master',
      'https://github.com/Somsubhra/github-release-stats.git',
      null
    )
    const remotes = [
      {
        name: 'upstream',
        url: 'https://github.com/Somsubhra/github-release-stats.git',
      },
    ]
    const upstream = findUpstreamRemote(parent, remotes)
    expect(upstream).not.toBeNull()
    expect(upstream!.name).toBe(UpstreamRemoteName)
    expect(upstream!.url).toBe(
      'https://github.com/Somsubhra/github-release-stats.git'
    )
  })
})
