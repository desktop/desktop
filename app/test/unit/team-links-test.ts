import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  getTeamGreeting,
  teamGiteaServer,
  teamLinks,
} from '../../src/lib/team-links'
import { getGiteaAPIEndpoint, getHostingServiceName } from '../../src/lib/gitea'

const at = (hour: number) => new Date(2026, 3, 1, hour, 30)

describe('team-links', () => {
  it('only contains https links with a label and icon', () => {
    assert(teamLinks.length > 0)
    for (const link of teamLinks) {
      assert.equal(new URL(link.url).protocol, 'https:', link.url)
      assert(link.label.length > 0)
      assert(link.icon.length > 0)
    }
  })

  it('has unique links', () => {
    const urls = teamLinks.map(l => l.url)
    assert.equal(new Set(urls).size, urls.length)
  })

  it('points at a valid Gitea server', () => {
    assert.equal(
      getGiteaAPIEndpoint(teamGiteaServer),
      `${teamGiteaServer}/api/v1`
    )
  })

  it('greets differently throughout the day', () => {
    assert.match(getTeamGreeting(at(8)), /おはよう/)
    assert.match(getTeamGreeting(at(12)), /お昼/)
    assert.match(getTeamGreeting(at(15)), /コミット/)
    assert.match(getTeamGreeting(at(20)), /おつかれ/)
    assert.match(getTeamGreeting(at(2)), /夜更かし/)
    assert.match(getTeamGreeting(at(23)), /夜更かし/)
  })
})

describe('getHostingServiceName', () => {
  it('names Gitea and GitHub', () => {
    assert.equal(getHostingServiceName(`${teamGiteaServer}/api/v1`), 'Gitea')
    assert.equal(getHostingServiceName('https://api.github.com'), 'GitHub')
    assert.equal(
      getHostingServiceName('https://ghe.example.com/api/v3'),
      'GitHub'
    )
  })
})
