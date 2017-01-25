import { expect } from 'chai'

import { parseRemote } from '../../src/lib/remote-parsing'

describe('URL remote parsing', () => {
  it('parses HTTPS URLs with a trailing git suffix', () => {
    const remote = parseRemote('https://github.com/hubot/repo.git')
    expect(remote).not.to.equal(null)
    expect(remote!.hostname).to.equal('github.com')
    expect(remote!.owner).to.equal('hubot')
    expect(remote!.name).to.equal('repo')
  })

  it('parses HTTPS URLs without a trailing git suffix', () => {
    const remote = parseRemote('https://github.com/hubot/repo')
    expect(remote).not.to.equal(null)
    expect(remote!.hostname).to.equal('github.com')
    expect(remote!.owner).to.equal('hubot')
    expect(remote!.name).to.equal('repo')
  })

  it('parses SSH URLs', () => {
    const remote = parseRemote('git@github.com:hubot/repo.git')
    expect(remote).not.to.equal(null)
    expect(remote!.hostname).to.equal('github.com')
    expect(remote!.owner).to.equal('hubot')
    expect(remote!.name).to.equal('repo')
  })

  it('parses git URLs', () => {
    const remote = parseRemote('git:github.com/hubot/repo.git')
    expect(remote).not.to.equal(null)
    expect(remote!.hostname).to.equal('github.com')
    expect(remote!.owner).to.equal('hubot')
    expect(remote!.name).to.equal('repo')
  })
})
