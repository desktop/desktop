import {
  findUpstreamRemote,
  UpstreamRemoteName,
} from '../../src/lib/stores/helpers/find-upstream-remote'
import { plainGitHubRepo } from '../helpers/github-repo-builder'

describe('findUpstreamRemote', () => {
  it('finds the upstream', () => {
    const parent = plainGitHubRepo({
      name: 'github-release-stats',
      owner: 'somsubhra',
    })
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
