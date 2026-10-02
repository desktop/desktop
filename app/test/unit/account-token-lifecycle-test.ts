import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Account } from '../../src/models/account'
import { AccountsStore } from '../../src/lib/stores/accounts-store'
import { InMemoryStore, AsyncInMemoryStore } from '../helpers/stores'

const account = new Account(
  'octocat',
  'https://api.github.com',
  'old-access',
  [],
  '',
  1,
  'Octocat'
)

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
