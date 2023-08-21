import { parseRemote } from '../../src/lib/remote-parsing'

describe('URL remote parsing', () => {
  it('parses HTTPS URLs with a trailing git suffix', () => {
    const remote = parseRemote('https://github.com/hubot/repo.git')
    expect(remote).not.toBeNull()
    expect(remote!.hostname).toBe('github.com')
    expect(remote!.owner).toBe('hubot')
    expect(remote!.name).toBe('repo')
  })

  it('parses HTTPS URLs with a trailing -git suffix', () => {
    const remote = parseRemote('https://github.com/hubot/repo-git')
    expect(remote).not.toBeNull()
    expect(remote!.hostname).toBe('github.com')
    expect(remote!.owner).toBe('hubot')
    expect(remote!.name).toBe('repo-git')
  })

  it('parses HTTPS URLs with a trailing -git and .git suffixes', () => {
    const remote = parseRemote('https://github.com/hubot/repo-git.git')
    expect(remote).not.toBeNull()
    expect(remote!.hostname).toBe('github.com')
    expect(remote!.owner).toBe('hubot')
    expect(remote!.name).toBe('repo-git')
  })

  it('parses HTTPS URLs without a trailing git suffix', () => {
    const remote = parseRemote('https://github.com/hubot/repo')
    expect(remote).not.toBeNull()
    expect(remote!.hostname).toBe('github.com')
    expect(remote!.owner).toBe('hubot')
    expect(remote!.name).toBe('repo')
  })

  it('parses HTTPS URLs with a trailing slash', () => {
    const remote = parseRemote('https://github.com/hubot/repo/')
    expect(remote).not.toBeNull()
    expect(remote!.hostname).toBe('github.com')
    expect(remote!.owner).toBe('hubot')
    expect(remote!.name).toBe('repo')
  })

  it('parses HTTPS URLs which include a username', () => {
    const remote = parseRemote('https://monalisa@github.com/hubot/repo.git')
    expect(remote).not.toBeNull()
    expect(remote!.hostname).toBe('github.com')
    expect(remote!.owner).toBe('hubot')
    expect(remote!.name).toBe('repo')
  })

  it('parses SSH URLs', () => {
    const remote = parseRemote('git@github.com:hubot/repo.git')
    expect(remote).not.toBeNull()
    expect(remote!.hostname).toBe('github.com')
    expect(remote!.owner).toBe('hubot')
    expect(remote!.name).toBe('repo')
  })

  it('parses SSH URLs with custom username', () => {
    const remote = parseRemote('niik@niik.ghe.com:hubot/repo.git')
    expect(remote).not.toBeNull()
    expect(remote!.hostname).toBe('niik.ghe.com')
    expect(remote!.owner).toBe('hubot')
    expect(remote!.name).toBe('repo')
  })

  it('parses SSH URLs without the git suffix', () => {
    const remote = parseRemote('git@github.com:hubot/repo')
    expect(remote).not.toBeNull()
    expect(remote!.hostname).toBe('github.com')
    expect(remote!.owner).toBe('hubot')
    expect(remote!.name).toBe('repo')
  })

  it('parses SSH URLs without the git suffix but with -git suffix', () => {
    const remote = parseRemote('git@github.com:hubot/repo-git')
    expect(remote).not.toBeNull()
    expect(remote!.hostname).toBe('github.com')
    expect(remote!.owner).toBe('hubot')
    expect(remote!.name).toBe('repo-git')
  })

  it('parses SSH URLs with the .git suffix and -git suffix', () => {
    const remote = parseRemote('git@github.com:hubot/repo-git.git')
    expect(remote).not.toBeNull()
    expect(remote!.hostname).toBe('github.com')
    expect(remote!.owner).toBe('hubot')
    expect(remote!.name).toBe('repo-git')
  })

  it('parses SSH URLs with a trailing slash', () => {
    const remote = parseRemote('git@github.com:hubot/repo/')
    expect(remote).not.toBeNull()
    expect(remote!.hostname).toBe('github.com')
    expect(remote!.owner).toBe('hubot')
    expect(remote!.name).toBe('repo')
  })

  it('parses git URLs', () => {
    const remote = parseRemote('git:github.com/hubot/repo.git')
    expect(remote).not.toBeNull()
    expect(remote!.hostname).toBe('github.com')
    expect(remote!.owner).toBe('hubot')
    expect(remote!.name).toBe('repo')
  })

  it('parses git URLs without the git suffix', () => {
    const remote = parseRemote('git:github.com/hubot/repo')
    expect(remote).not.toBeNull()
    expect(remote!.hostname).toBe('github.com')
    expect(remote!.owner).toBe('hubot')
    expect(remote!.name).toBe('repo')
  })

  it('parses git URLs with a trailing slash', () => {
    const remote = parseRemote('git:github.com/hubot/repo/')
    expect(remote).not.toBeNull()
    expect(remote!.hostname).toBe('github.com')
    expect(remote!.owner).toBe('hubot')
    expect(remote!.name).toBe('repo')
  })

  it('parses SSH URLs with the ssh prefix', () => {
    const remote = parseRemote('ssh://git@github.com/hubot/repo')
    expect(remote).not.toBeNull()
    expect(remote!.hostname).toBe('github.com')
    expect(remote!.owner).toBe('hubot')
    expect(remote!.name).toBe('repo')
  })

  it('parses SSH URLs with the ssh prefix and trailing slash', () => {
    const remote = parseRemote('ssh://git@github.com/hubot/repo/')
    expect(remote).not.toBeNull()
    expect(remote!.hostname).toBe('github.com')
    expect(remote!.owner).toBe('hubot')
    expect(remote!.name).toBe('repo')
  })

  it('does not parse invalid HTTP URLs when missing repo name', () => {
    const remote = parseRemote('https://github.com/someuser//')
    expect(remote).toBeNull()
  })

  it('does not parse invalid SSH URLs when missing repo name ', () => {
    const remote = parseRemote('git@github.com:hubot/')
    expect(remote).toBeNull()
  })

  it('does not parse invalid git URLs when missing repo name', () => {
    const remote = parseRemote('git:github.com/hubot/')
    expect(remote).toBeNull()
  })

  it('does not parse invalid HTTP URLs when missing repo owner', () => {
    const remote = parseRemote('https://github.com//somerepo')
    expect(remote).toBeNull()
  })

  it('does not parse invalid SSH URLs when missing repo owner', () => {
    const remote = parseRemote('git@github.com:/somerepo')
    expect(remote).toBeNull()
  })

  it('does not parse invalid git URLs when missing repo owner', () => {
    const remote = parseRemote('git:github.com/hubot/')
    expect(remote).toBeNull()
  })
})
