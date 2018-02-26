import { expect } from 'chai'

import {
  matchGitHubRepository,
  repositoryMatchesRemote,
} from '../../src/lib/repository-matching'
import { Account } from '../../src/models/account'
import { GitHubRepository } from '../../src/models/github-repository'
import { IRemote } from '../../src/models/remote'

describe('Repository matching', () => {
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

  describe('repositoryMatchesRemote', () => {
    const cloneURL = 'https://github.com/shiftkey/desktop.git'
    const htmlURL = 'https://github.com/shiftkey/desktop'

    const githubRepo: GitHubRepository = {
      dbID: -1,
      name: 'desktop',
      owner: {
        login: 'shiftkey',
        id: 1,
        endpoint: 'https://api.github.com',
        hash: 'something',
      },
      private: false,
      defaultBranch: 'master',
      parent: null,
      endpoint: 'https://api.github.com',
      fullName: 'shiftkey/desktop',
      fork: true,
      hash: 'whatever',
      cloneURL,
      htmlURL,
    }

    it('matches clone url', () => {
      const remote: IRemote = {
        name: 'origin',
        url: cloneURL,
      }
      expect(repositoryMatchesRemote(githubRepo, remote)).to.be.true
    })

    it('matches clone url', () => {
      const remote: IRemote = {
        name: 'origin',
        url: htmlURL,
      }
      expect(repositoryMatchesRemote(githubRepo, remote)).to.be.true
    })
  })
})
