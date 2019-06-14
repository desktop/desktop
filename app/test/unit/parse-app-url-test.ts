import {
  parseAppURL,
  IOpenRepositoryFromURLAction,
  IOpenRepositoryFromPathAction,
  IOAuthAction,
} from '../../src/lib/parse-app-url'

describe('parseAppURL', () => {
  it('returns unknown by default', () => {
    expect(parseAppURL('').name).toBe('unknown')
  })

  describe('oauth', () => {
    it('returns right name', () => {
      const result = parseAppURL(
        'x-github-client://oauth?code=18142422&state=e4cd2dea-1567-46aa-8eb2-c7f56e943187'
      )
      expect(result.name).toBe('oauth')

      const openRepo = result as IOAuthAction
      expect(openRepo.code).toBe('18142422')
    })
  })

  describe('openRepo via HTTPS', () => {
    it('returns right name', () => {
      const result = parseAppURL(
        'github-mac://openRepo/https://github.com/desktop/desktop'
      )
      expect(result.name).toBe('open-repository-from-url')

      const openRepo = result as IOpenRepositoryFromURLAction
      expect(openRepo.url).toBe('https://github.com/desktop/desktop')
    })

    it('returns unknown when no remote defined', () => {
      const result = parseAppURL('github-mac://openRepo/')
      expect(result.name).toBe('unknown')
    })

    it('adds branch name if set', () => {
      const result = parseAppURL(
        'github-mac://openRepo/https://github.com/desktop/desktop?branch=cancel-2fa-flow'
      )
      expect(result.name).toBe('open-repository-from-url')

      const openRepo = result as IOpenRepositoryFromURLAction
      expect(openRepo.url).toBe('https://github.com/desktop/desktop')
      expect(openRepo.branch).toBe('cancel-2fa-flow')
    })

    it('adds pull request ID if found', () => {
      const result = parseAppURL(
        'github-mac://openRepo/https://github.com/octokit/octokit.net?branch=pr%2F1569&pr=1569'
      )
      expect(result.name).toBe('open-repository-from-url')

      const openRepo = result as IOpenRepositoryFromURLAction
      expect(openRepo.url).toBe('https://github.com/octokit/octokit.net')
      expect(openRepo.branch).toBe('pr/1569')
      expect(openRepo.pr).toBe('1569')
    })

    it('returns unknown for unexpected pull request input', () => {
      const result = parseAppURL(
        'github-mac://openRepo/https://github.com/octokit/octokit.net?branch=bar&pr=foo'
      )
      expect(result.name).toBe('unknown')
    })

    it('returns unknown for invalid branch name', () => {
      // branch=<>
      const result = parseAppURL(
        'github-mac://openRepo/https://github.com/octokit/octokit.net?branch=%3C%3E'
      )
      expect(result.name).toBe('unknown')
    })

    it('adds file path if found', () => {
      const result = parseAppURL(
        'github-mac://openRepo/https://github.com/octokit/octokit.net?branch=master&filepath=Octokit.Reactive%2FOctokit.Reactive.csproj'
      )
      expect(result.name).toBe('open-repository-from-url')

      const openRepo = result as IOpenRepositoryFromURLAction
      expect(openRepo.url).toBe('https://github.com/octokit/octokit.net')
      expect(openRepo.branch).toBe('master')
      expect(openRepo.filepath).toBe('Octokit.Reactive/Octokit.Reactive.csproj')
    })
  })

  describe('openRepo via SSH', () => {
    it('returns right name', () => {
      const result = parseAppURL(
        'github-mac://openRepo/git@github.com/desktop/desktop'
      )
      expect(result.name).toBe('open-repository-from-url')

      const openRepo = result as IOpenRepositoryFromURLAction
      expect(openRepo.url).toBe('git@github.com/desktop/desktop')
    })

    it('returns unknown when no remote defined', () => {
      const result = parseAppURL('github-mac://openRepo/')
      expect(result.name).toBe('unknown')
    })

    it('adds branch name if set', () => {
      const result = parseAppURL(
        'github-mac://openRepo/git@github.com/desktop/desktop?branch=cancel-2fa-flow'
      )
      expect(result.name).toBe('open-repository-from-url')

      const openRepo = result as IOpenRepositoryFromURLAction
      expect(openRepo.url).toBe('git@github.com/desktop/desktop')
      expect(openRepo.branch).toBe('cancel-2fa-flow')
    })

    it('adds pull request ID if found', () => {
      const result = parseAppURL(
        'github-mac://openRepo/git@github.com/octokit/octokit.net?branch=pr%2F1569&pr=1569'
      )
      expect(result.name).toBe('open-repository-from-url')

      const openRepo = result as IOpenRepositoryFromURLAction
      expect(openRepo.url).toBe('git@github.com/octokit/octokit.net')
      expect(openRepo.branch).toBe('pr/1569')
      expect(openRepo.pr).toBe('1569')
    })

    it('returns unknown for unexpected pull request input', () => {
      const result = parseAppURL(
        'github-mac://openRepo/git@github.com/octokit/octokit.net?branch=bar&pr=foo'
      )
      expect(result.name).toBe('unknown')
    })

    it('returns unknown for invalid branch name', () => {
      // branch=<>
      const result = parseAppURL(
        'github-mac://openRepo/git@github.com/octokit/octokit.net?branch=%3C%3E'
      )
      expect(result.name).toBe('unknown')
    })

    it('adds file path if found', () => {
      const result = parseAppURL(
        'github-mac://openRepo/git@github.com/octokit/octokit.net?branch=master&filepath=Octokit.Reactive%2FOctokit.Reactive.csproj'
      )
      expect(result.name).toBe('open-repository-from-url')

      const openRepo = result as IOpenRepositoryFromURLAction
      expect(openRepo.url).toBe('git@github.com/octokit/octokit.net')
      expect(openRepo.branch).toBe('master')
      expect(openRepo.filepath).toBe('Octokit.Reactive/Octokit.Reactive.csproj')
    })
  })

  describe('openLocalRepo', () => {
    it('parses local paths', () => {
      const path = __WIN32__
        ? 'C:\\Users\\johnsmith\\repo'
        : '/Users/johnsmith/repo'
      const result = parseAppURL(
        `x-github-client://openLocalRepo/${encodeURIComponent(path)}`
      )
      expect(result.name).toBe('open-repository-from-path')

      const openRepo = result as IOpenRepositoryFromPathAction
      expect(openRepo.path).toBe(path)
    })

    it('deals with not having a local path', () => {
      let result = parseAppURL(`x-github-client://openLocalRepo/`)
      expect(result.name).toBe('unknown')

      result = parseAppURL(`x-github-client://openLocalRepo`)
      expect(result.name).toBe('unknown')
    })
  })
})
