import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  matchGitHubRepository,
  urlMatchesRemote,
  urlMatchesCloneURL,
  chooseAccountForRemoteRepository,
  probeRemoteRepositoryAccounts,
} from '../../src/lib/repository-matching'
import { Account } from '../../src/models/account'
import { GitHubRepository } from '../../src/models/github-repository'
import { gitHubRepoFixture } from '../helpers/github-repo-builder'
import { API } from '../../src/lib/api'
import { createMockAPI, createMockAPIRepository } from '../helpers/mock-api'

describe('choosing an account for a newly added or cloned remote', () => {
  const endpoint = 'https://api.github.com'
  const alice = new Account('alice', endpoint, 'alice-token', [], '', 1, '')
  const bob = new Account('bob', endpoint, 'bob-token', [], '', 2, '')
  const enterprise = new Account(
    'alice',
    'https://enterprise.example/api/v3',
    'enterprise-token',
    [],
    '',
    3,
    ''
  )
  const remote = 'https://github.com/owner/repo.git'
  const apiRepository = { ...createMockAPIRepository(), parent: undefined }

  it('exposes metadata for every accessible account without selecting an identity', async t => {
    const tokens: string[] = []
    t.mock.method(API, 'fromAccount', (account: Account) =>
      createMockAPI({
        fetchRepository: async () => {
          tokens.push(account.token)
          return apiRepository
        },
      })
    )
    const results = await probeRemoteRepositoryAccounts(
      [alice, enterprise, bob],
      remote
    )
    assert.deepStrictEqual(
      results.map(result => result.account),
      [alice, bob]
    )
    assert.ok(results.every(result => result.apiRepository === apiRepository))
    assert.deepStrictEqual(tokens, ['alice-token', 'bob-token'])
  })

  it('probes all matching accounts and automatically selects the only account with access', async t => {
    const requests: string[][] = []
    t.mock.method(API, 'fromAccount', (account: Account) =>
      createMockAPI({
        fetchRepository: async (owner, name) => {
          requests.push([account.token, owner, name])
          return account === bob ? apiRepository : null
        },
      })
    )
    const result = await chooseAccountForRemoteRepository(
      [alice, enterprise, bob],
      remote,
      '/repo',
      async () => assert.fail('A single accessible account needs no chooser')
    )
    assert.strictEqual(result?.account, bob)
    assert.strictEqual(result?.apiRepository, apiRepository)
    assert.deepStrictEqual(requests, [
      ['alice-token', 'owner', 'repo'],
      ['bob-token', 'owner', 'repo'],
    ])
  })

  it('prompts with only accessible accounts using an unpersisted repository', async t => {
    t.mock.method(API, 'fromAccount', () =>
      createMockAPI({ fetchRepository: async () => apiRepository })
    )
    let choices = 0
    const result = await chooseAccountForRemoteRepository(
      [alice, enterprise, bob],
      remote,
      '/repo',
      async (repository, accounts) => {
        choices++
        assert.strictEqual(repository.id, -1)
        assert.strictEqual(repository.login, null)
        assert.strictEqual(repository.path, '/repo')
        assert.strictEqual(repository.gitHubRepository.fullName, 'owner/repo')
        assert.deepStrictEqual(accounts, [alice, bob])
        return bob
      }
    )
    assert.strictEqual(choices, 1)
    assert.strictEqual(result?.account, bob)
  })

  it('leaves the assignment null when no signed-in account can access the remote', async t => {
    t.mock.method(API, 'fromAccount', () =>
      createMockAPI({ fetchRepository: async () => null })
    )
    for (const accounts of [[], [alice, bob]]) {
      assert.strictEqual(
        await chooseAccountForRemoteRepository(
          accounts,
          remote,
          '/repo',
          async () => assert.fail('No accessible accounts must not prompt')
        ),
        null
      )
    }
  })

  it('distinguishes canceling the chooser from having no accessible account', async t => {
    t.mock.method(API, 'fromAccount', () =>
      createMockAPI({ fetchRepository: async () => apiRepository })
    )
    assert.strictEqual(
      await chooseAccountForRemoteRepository(
        [alice, bob],
        remote,
        '/repo',
        async () => undefined
      ),
      undefined
    )
  })

  it('rejects an account that was not verified instead of falling back', async t => {
    t.mock.method(API, 'fromAccount', () =>
      createMockAPI({ fetchRepository: async () => apiRepository })
    )
    await assert.rejects(
      chooseAccountForRemoteRepository(
        [alice, bob],
        remote,
        '/repo',
        async () => enterprise
      ),
      /has not been verified/
    )
  })

  it('surfaces unexpected probe errors rather than treating them as no access', async t => {
    t.mock.method(API, 'fromAccount', () =>
      createMockAPI({
        fetchRepository: async () => {
          throw new Error('Probe failed')
        },
      })
    )
    await assert.rejects(
      chooseAccountForRemoteRepository(
        [alice],
        remote,
        '/repo',
        async () => undefined
      ),
      /Probe failed/
    )
  })
})

describe('repository-matching', () => {
  describe('matchGitHubRepository', () => {
    it('matches HTTPS URLs', () => {
      const accounts = [
        new Account(
          'alovelace',
          'https://api.github.com',
          '',
          [],
          '',
          1,
          '',
          'free'
        ),
      ]
      const repo = matchGitHubRepository(
        accounts,
        'https://github.com/someuser/somerepo.git'
      )
      assert(repo !== null)
      assert.equal(repo.name, 'somerepo')
      assert.equal(repo.owner, 'someuser')
    })

    it('matches HTTPS URLs without the git extension', () => {
      const accounts = [
        new Account(
          'alovelace',
          'https://api.github.com',
          '',
          [],
          '',
          1,
          '',
          'free'
        ),
      ]
      const repo = matchGitHubRepository(
        accounts,
        'https://github.com/someuser/somerepo'
      )
      assert(repo !== null)
      assert.equal(repo.name, 'somerepo')
      assert.equal(repo.owner, 'someuser')
    })

    it('matches git URLs', () => {
      const accounts = [
        new Account(
          'alovelace',
          'https://api.github.com',
          '',
          [],
          '',
          1,
          '',
          'free'
        ),
      ]
      const repo = matchGitHubRepository(
        accounts,
        'git:github.com/someuser/somerepo.git'
      )
      assert(repo !== null)
      assert.equal(repo.name, 'somerepo')
      assert.equal(repo.owner, 'someuser')
    })

    it('matches SSH URLs', () => {
      const accounts = [
        new Account(
          'alovelace',
          'https://api.github.com',
          '',
          [],
          '',
          1,
          '',
          'free'
        ),
      ]
      const repo = matchGitHubRepository(
        accounts,
        'git@github.com:someuser/somerepo.git'
      )
      assert(repo !== null)
      assert.equal(repo.name, 'somerepo')
      assert.equal(repo.owner, 'someuser')
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
          '',
          'free'
        ),
      ]
      const repo = matchGitHubRepository(
        accounts,
        'https://github.com/someuser/somerepo.git'
      )
      assert(repo === null)
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
        assert(!urlMatchesRemote(null, remoteWithSuffix))
      })

      it('matches cloneURL from API', () => {
        const cloneURL = 'https://github.com/shiftkey/desktop.git'
        assert(urlMatchesRemote(cloneURL, remoteWithSuffix))
      })

      it('matches cloneURL from API with different casing', () => {
        const cloneURL = 'https://GITHUB.COM/SHIFTKEY/DESKTOP.git'
        assert(urlMatchesRemote(cloneURL, remoteWithSuffix))
      })

      it('matches cloneURL from API without suffix', () => {
        const cloneURL = 'https://github.com/shiftkey/desktop.git'
        assert(urlMatchesRemote(cloneURL, remote))
      })

      it('matches htmlURL from API', () => {
        const htmlURL = 'https://github.com/shiftkey/desktop'
        assert(urlMatchesRemote(htmlURL, remoteWithSuffix))
      })

      it('matches htmlURL from API with different casing', () => {
        const htmlURL = 'https://GITHUB.COM/SHIFTKEY/DESKTOP'
        assert(urlMatchesRemote(htmlURL, remoteWithSuffix))
      })

      it('matches htmlURL from API without suffix', () => {
        const htmlURL = 'https://github.com/shiftkey/desktop'
        assert(urlMatchesRemote(htmlURL, remote))
      })
    })

    describe('with SSH remote', () => {
      const remote = {
        name: 'origin',
        url: 'git@github.com:shiftkey/desktop.git',
      }
      it('does not match null', () => {
        assert(!urlMatchesRemote(null, remote))
      })

      it('matches cloneURL from API', () => {
        const cloneURL = 'https://github.com/shiftkey/desktop.git'
        assert(urlMatchesRemote(cloneURL, remote))
      })

      it('matches htmlURL from API', () => {
        const htmlURL = 'https://github.com/shiftkey/desktop'
        assert(urlMatchesRemote(htmlURL, remote))
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
      },
      isPrivate: false,
      htmlURL: 'https://github.com/shiftkey/desktop',
      parent: null,
      endpoint: 'https://api.github.com/',
      fork: true,
      hash: 'whatever',
      issuesEnabled: true,
      isArchived: false,
      permissions: null,
    }

    it('returns true for exact match', () => {
      assert.equal(
        urlMatchesCloneURL(
          'https://github.com/shiftkey/desktop.git',
          repository
        ),
        true
      )
    })

    it(`returns true when URL doesn't have a .git suffix`, () => {
      assert.equal(
        urlMatchesCloneURL('https://github.com/shiftkey/desktop', repository),
        true
      )
    })

    it(`returns false when URL belongs to a different owner`, () => {
      assert.equal(
        urlMatchesCloneURL(
          'https://github.com/outofambit/desktop.git',
          repository
        ),
        false
      )
    })

    it(`returns false if GitHub repository does't have a cloneURL set`, () => {
      assert.equal(
        urlMatchesCloneURL(
          'https://github.com/shiftkey/desktop',
          repositoryWithoutCloneURL
        ),
        false
      )
    })
  })
})
