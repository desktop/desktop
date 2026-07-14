import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  findUpstreamRemote,
  UpstreamRemoteName,
} from '../../src/lib/stores/helpers/find-upstream-remote'
import { gitHubRepoFixture } from '../helpers/github-repo-builder'

describe('findUpstreamRemote', () => {
  it('finds the upstream', () => {
    const parent = gitHubRepoFixture({
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
    assert(upstream !== null)
    assert.equal(upstream.name, UpstreamRemoteName)
    assert.equal(
      upstream.url,
      'https://github.com/Somsubhra/github-release-stats.git'
    )
  })
})
