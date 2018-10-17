import { expect } from 'chai'

import {
  matchGitHubRepository,
  urlMatchesRemote,
  urlMatchesCloneURL,
} from '../../src/lib/repository-matching'
import { Account } from '../../src/models/account'
import { GitHubRepository } from '../../src/models/github-repository'

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
      expect(repo.name).to.equal('somerepo')
      expect(repo.owner).to.equal('someuser')
    })

    it('matches HTTPS URLs without the git extension', () => {
      const accounts = [
        new Account('alovelace', 'https://api.github.com', '', [], '', 1, ''),
      ]
      const repo = matchGitHubRepository(
        accounts,
        'https://github.com/someuser/somerepo'
      )!
      expect(repo.name).to.equal('somerepo')
      expect(repo.owner).to.equal('someuser')
    })

    it('matches git URLs', () => {
      const accounts = [
        new Account('alovelace', 'https://api.github.com', '', [], '', 1, ''),
      ]
      const repo = matchGitHubRepository(
        accounts,
        'git:github.com/someuser/somerepo.git'
      )!
      expect(repo.name).to.equal('somerepo')
      expect(repo.owner).to.equal('someuser')
    })

    it('matches SSH URLs', () => {
      const accounts = [
        new Account('alovelace', 'https://api.github.com', '', [], '', 1, ''),
      ]
      const repo = matchGitHubRepository(
        accounts,
        'git@github.com:someuser/somerepo.git'
      )!
      expect(repo.name).to.equal('somerepo')
      expect(repo.owner).to.equal('someuser')
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
      expect(repo).to.equal(null)
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
        expect(urlMatchesRemote(null, remoteWithSuffix)).is.false
      })

      it('matches cloneURL from API', () => {
        const cloneURL = 'https://github.com/shiftkey/desktop.git'
        expect(urlMatchesRemote(cloneURL, remoteWithSuffix)).is.true
      })

      it('matches cloneURL from API without suffix', () => {
        const cloneURL = 'https://github.com/shiftkey/desktop.git'
        expect(urlMatchesRemote(cloneURL, remote)).is.true
      })

      it('matches htmlURL from API', () => {
        const htmlURL = 'https://github.com/shiftkey/desktop'
        expect(urlMatchesRemote(htmlURL, remoteWithSuffix)).is.true
      })

      it('matches htmlURL from API without suffix', () => {
        const htmlURL = 'https://github.com/shiftkey/desktop'
        expect(urlMatchesRemote(htmlURL, remote)).is.true
      })
    })

    describe('with SSH remote', () => {
      const remote = {
        name: 'origin',
        url: 'git@github.com:shiftkey/desktop.git',
      }
      it('does not match null', () => {
        expect(urlMatchesRemote(null, remote)).to.be.false
      })

      it('matches cloneURL from API', () => {
        const cloneURL = 'https://github.com/shiftkey/desktop.git'
        expect(urlMatchesRemote(cloneURL, remote)).to.be.true
      })
      it('matches htmlURL from API', () => {
        const htmlURL = 'https://github.com/shiftkey/desktop'
        expect(urlMatchesRemote(htmlURL, remote)).to.be.true
      })
    })
  })

  describe('cloneUrlMatches', () => {
    const repository: GitHubRepository = {
      dbID: 1,
      name: 'desktop',
      fullName: 'shiftkey/desktop',
      cloneURL: 'https://github.com/shiftkey/desktop.git',
      owner: {
        login: 'shiftkey',
        id: 1234,
        endpoint: 'https://api.github.com/',
        hash: 'whatever',
      },
      private: false,
      htmlURL: 'https://github.com/shiftkey/desktop',
      defaultBranch: 'master',
      parent: null,
      endpoint: 'https://api.github.com/',
      fork: true,
      hash: 'whatever',
    }

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
      private: false,
      htmlURL: 'https://github.com/shiftkey/desktop',
      defaultBranch: 'master',
      parent: null,
      endpoint: 'https://api.github.com/',
      fork: true,
      hash: 'whatever',
    }

    it('returns true for exact match', () => {
      expect(
        urlMatchesCloneURL(
          'https://github.com/shiftkey/desktop.git',
          repository
        )
      ).is.true
    })

    it(`returns true when URL doesn't have a .git suffix`, () => {
      expect(
        urlMatchesCloneURL('https://github.com/shiftkey/desktop', repository)
      ).is.true
    })

    it(`returns false when URL belongs to a different owner`, () => {
      expect(
        urlMatchesCloneURL(
          'https://github.com/outofambit/desktop.git',
          repository
        )
      ).is.false
    })

    it(`returns false if GitHub repository does't have a cloneURL set`, () => {
      expect(
        urlMatchesCloneURL(
          'https://github.com/shiftkey/desktop',
          repositoryWithoutCloneURL
        )
      ).is.false
    })
  })
})
