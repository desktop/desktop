import {
  matchGitHubRepository,
  urlMatchesRemote,
  urlMatchesCloneURL,
} from '../../src/lib/repository-matching'
import { Account } from '../../src/models/account'
import { GitHubRepository } from '../../src/models/github-repository'
import { gitHubRepoFixture } from '../helpers/github-repo-builder'

describe('repository-matching', () => {
  describe('matchGitHubRepository', () => {
    it('matches HTTPS URLs', () => {
      const accounts = [
        new Account('alovelace', 'https://api.github.com', '', [], '', 1, ''),
      ]
      const repo = matchGitHubRepository(
        accounts,
        'https://github.com/someuser/somerepo.git'
      )!
      expect(repo.name).toEqual('somerepo')
      expect(repo.owner).toEqual('someuser')
    })

    it('matches HTTPS URLs without the git extension', () => {
      const accounts = [
        new Account('alovelace', 'https://api.github.com', '', [], '', 1, ''),
      ]
      const repo = matchGitHubRepository(
        accounts,
        'https://github.com/someuser/somerepo'
      )!
      expect(repo.name).toBe('somerepo')
      expect(repo.owner).toBe('someuser')
    })

    it('matches git URLs', () => {
      const accounts = [
        new Account('alovelace', 'https://api.github.com', '', [], '', 1, ''),
      ]
      const repo = matchGitHubRepository(
        accounts,
        'git:github.com/someuser/somerepo.git'
      )!
      expect(repo.name).toBe('somerepo')
      expect(repo.owner).toBe('someuser')
    })

    it('matches SSH URLs', () => {
      const accounts = [
        new Account('alovelace', 'https://api.github.com', '', [], '', 1, ''),
      ]
      const repo = matchGitHubRepository(
        accounts,
        'git@github.com:someuser/somerepo.git'
      )!
      expect(repo.name).toBe('somerepo')
      expect(repo.owner).toBe('someuser')
    })

    it(`doesn't match if there aren't any users with that endpoint`, () => {
      const accounts = [
        new Account(
          'alovelace',
          'https://github.babbageinc.com',
          '',
          [],
          '',
          1,
          ''
        ),
      ]
      const repo = matchGitHubRepository(
        accounts,
        'https://github.com/someuser/somerepo.git'
      )
      expect(repo).toBeNull()
    })
  })

  describe('urlMatchesRemote', () => {
    describe('with HTTPS remote', () => {
      const remote = {
        name: 'origin',
        url: 'https://github.com/shiftkey/desktop',
      }
      const remoteWithSuffix = {
        name: 'origin',
        url: 'https://github.com/shiftkey/desktop.git',
      }

      it('does not match null', () => {
        expect(urlMatchesRemote(null, remoteWithSuffix)).toBe(false)
      })

      it('matches cloneURL from API', () => {
        const cloneURL = 'https://github.com/shiftkey/desktop.git'
        expect(urlMatchesRemote(cloneURL, remoteWithSuffix)).toBe(true)
      })

      it('matches cloneURL from API with different casing', () => {
        const cloneURL = 'https://GITHUB.COM/SHIFTKEY/DESKTOP.git'
        expect(urlMatchesRemote(cloneURL, remoteWithSuffix)).toBe(true)
      })

      it('matches cloneURL from API without suffix', () => {
        const cloneURL = 'https://github.com/shiftkey/desktop.git'
        expect(urlMatchesRemote(cloneURL, remote)).toBe(true)
      })

      it('matches htmlURL from API', () => {
        const htmlURL = 'https://github.com/shiftkey/desktop'
        expect(urlMatchesRemote(htmlURL, remoteWithSuffix)).toBe(true)
      })

      it('matches htmlURL from API with different casing', () => {
        const htmlURL = 'https://GITHUB.COM/SHIFTKEY/DESKTOP'
        expect(urlMatchesRemote(htmlURL, remoteWithSuffix)).toBe(true)
      })

      it('matches htmlURL from API without suffix', () => {
        const htmlURL = 'https://github.com/shiftkey/desktop'
        expect(urlMatchesRemote(htmlURL, remote)).toBe(true)
      })
    })

    describe('with SSH remote', () => {
      const remote = {
        name: 'origin',
        url: 'git@github.com:shiftkey/desktop.git',
      }
      it('does not match null', () => {
        expect(urlMatchesRemote(null, remote)).toBe(false)
      })

      it('matches cloneURL from API', () => {
        const cloneURL = 'https://github.com/shiftkey/desktop.git'
        expect(urlMatchesRemote(cloneURL, remote)).toBe(true)
      })

      it('matches htmlURL from API', () => {
        const htmlURL = 'https://github.com/shiftkey/desktop'
        expect(urlMatchesRemote(htmlURL, remote)).toBe(true)
      })
    })
  })

  describe('cloneUrlMatches', () => {
    const repository = gitHubRepoFixture({
      name: 'desktop',
      owner: 'shiftkey',
      isPrivate: false,
    })

    const repositoryWithoutCloneURL: GitHubRepository = {
      dbID: 1,
      name: 'desktop',
      fullName: 'shiftkey/desktop',
      cloneURL: null,
      owner: {
        login: 'shiftkey',
        id: 1234,
        endpoint: 'https://api.github.com/',
        hash: 'whatever',
      },
      isPrivate: false,
      htmlURL: 'https://github.com/shiftkey/desktop',
      defaultBranch: 'master',
      parent: null,
      endpoint: 'https://api.github.com/',
      fork: true,
      hash: 'whatever',
      issuesEnabled: true,
      isArchived: false,
      permissions: null,
    }

    it('returns true for exact match', () => {
      expect(
        urlMatchesCloneURL(
          'https://github.com/shiftkey/desktop.git',
          repository
        )
      ).toBe(true)
    })

    it(`returns true when URL doesn't have a .git suffix`, () => {
      expect(
        urlMatchesCloneURL('https://github.com/shiftkey/desktop', repository)
      ).toBe(true)
    })

    it(`returns false when URL belongs to a different owner`, () => {
      expect(
        urlMatchesCloneURL(
          'https://github.com/outofambit/desktop.git',
          repository
        )
      ).toBe(false)
    })

    it(`returns false if GitHub repository does't have a cloneURL set`, () => {
      expect(
        urlMatchesCloneURL(
          'https://github.com/shiftkey/desktop',
          repositoryWithoutCloneURL
        )
      ).toBe(false)
    })
  })
})
