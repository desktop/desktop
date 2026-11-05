import assert from 'node:assert'
import { afterEach, describe, it } from 'node:test'
import { captureCommitPushAuthorization } from '../../src/lib/commit-push'
import { AccountsStore } from '../../src/lib/stores/accounts-store'
import { AccountRequiresSignInError } from '../../src/lib/credential-sessions'
import { Repository } from '../../src/models/repository'
import { GitHubRepository } from '../../src/models/github-repository'
import { Owner } from '../../src/models/owner'
import { Account } from '../../src/models/account'
import { InMemoryStore, AsyncInMemoryStore } from '../helpers/stores'

afterEach(() => localStorage.clear())

describe('manual commit push authorization', () => {
  for (const change of ['rotation', 'replacement'] as const) {
    it(`preserves issuing-session intent across credential ${change}`, async () => {
      let now = Date.now()
      let renewals = 0
      const store = new AccountsStore(
        new InMemoryStore(),
        new AsyncInMemoryStore(),
        async () => {
          renewals++
          return {
            accessToken: 'rotated-access',
            refreshToken: 'rotated-refresh',
            expiresAt: now + 8 * 60 * 60_000,
          }
        },
        () => now
      )
      const original = new Account(
        'fixture',
        'https://api.github.com',
        'synthetic-access',
        [],
        '',
        1,
        'Fixture'
      )
      const account = await store.addAccount(original, {
        accessToken: original.token,
        refreshToken: 'synthetic-refresh',
        expiresAt: now + 8 * 60 * 60_000,
      })
      assert.ok(account)
      const repository = new Repository(
        '/synthetic',
        1,
        new GitHubRepository(
          'synthetic',
          new Owner('fixture', account.endpoint, 1),
          1,
          false,
          'https://github.com/fixture/synthetic'
        ),
        false,
        null,
        {},
        false,
        undefined,
        undefined,
        account.login
      )
      const verify = captureCommitPushAuthorization(
        repository,
        store,
        () => [account],
        () => repository
      )
      verify()
      if (change === 'rotation') {
        now += 8 * 60 * 60_000
        await store.getAccountWithFreshToken(account)
        verify()
        assert.strictEqual(renewals, 1)
      } else {
        await store.addAccount(account)
        assert.throws(verify, AccountRequiresSignInError)
        assert.strictEqual(renewals, 0)
      }
    })
  }
})
