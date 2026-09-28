import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Account } from '../../src/models/account'
import { AccountsStore } from '../../src/lib/stores/accounts-store'
import { IOAuthToken } from '../../src/lib/oauth-token'
import {
  deserializeAccountCredential,
  serializeAccountCredential,
} from '../../src/lib/account-credential'
import { getKeyForAccount } from '../../src/lib/auth'
import { InMemoryStore, AsyncInMemoryStore } from '../helpers/stores'

const now = 1_800_000_000_000
const account = new Account(
  'octocat',
  'https://api.github.com',
  'old-access',
  [],
  '',
  1,
  'Octocat'
)
const rotating: IOAuthToken = {
  accessToken: account.token,
  refreshToken: 'old-refresh',
  expiresAt: now + 600_000,
  refreshTokenExpiresAt: now + 100_000_000,
}

describe('OAuth credential persistence', () => {
  it('reads existing access-token entries', () => {
    assert.deepEqual(deserializeAccountCredential('legacy'), {
      accessToken: 'legacy',
    })
    assert.equal(
      serializeAccountCredential({ accessToken: 'legacy' }),
      'legacy'
    )
  })

  it('round trips the entire rotating pair and reauthentication marker', () => {
    assert.deepEqual(
      deserializeAccountCredential(serializeAccountCredential(rotating)),
      rotating
    )
    assert.equal(
      deserializeAccountCredential(serializeAccountCredential(null)),
      null
    )
  })

  it('rejects corrupted or unsupported records without exposing secrets', () => {
    for (const value of [
      'github-desktop-oauth:secret',
      'github-desktop-oauth:{"version":2,"credential":"secret"}',
      'github-desktop-oauth:{"version":1,"credential":{"accessToken":"secret"}}',
    ]) {
      assert.throws(
        () => deserializeAccountCredential(value),
        error => error instanceof Error && !error.message.includes('secret')
      )
    }
  })

  it('signs out accounts marked as requiring sign-in by an earlier build', async () => {
    const data = new InMemoryStore()
    const secure = new AsyncInMemoryStore()
    const store = new AccountsStore(data, secure)
    await store.addAccount(account)
    await secure.setItem(
      getKeyForAccount(account),
      account.login,
      serializeAccountCredential(null)
    )
    const restarted = new AccountsStore(data, secure)
    assert.deepEqual(await restarted.getAll(), [])
    assert.equal(
      await secure.getItem(getKeyForAccount(account), account.login),
      null
    )
    assert.equal(data.getItem('users'), '[]')
  })
})

describe('Account token invalidation', () => {
  it('reports failures from API invalidation callbacks through the store', async t => {
    const store = new AccountsStore(
      new InMemoryStore(),
      new AsyncInMemoryStore()
    )
    const failure = new Error('Keychain unavailable')
    t.mock.method(store, 'invalidateToken', async () => {
      throw failure
    })
    const errors: Error[] = []
    store.onDidError(error => errors.push(error))
    t.mock.method(log, 'error')

    store.handleTokenInvalidated(account.endpoint, account.token)
    await new Promise<void>(resolve => setImmediate(resolve))
    assert.deepEqual(errors, [failure])
  })
})
