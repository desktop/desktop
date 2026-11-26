import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Account } from '../../src/models/account'
import { AccountsStore } from '../../src/lib/stores/accounts-store'
import { InMemoryStore, AsyncInMemoryStore } from '../helpers/stores'
import { lookupPreferredEmail } from '../../src/lib/email'

const endpoint = 'https://api.github.com'
const alice = new Account('alice', endpoint, 'secret', [], '', 1, 'Alice')

describe('managed commit identities', () => {
  it('defaults to Git and retains credential-free overrides after sign-out and relaunch', async () => {
    const data = new InMemoryStore()
    const secure = new AsyncInMemoryStore()
    const store = new AccountsStore(data, secure)
    await store.addAccount(alice)
    assert.equal(store.getCommitIdentitySettings().mode, 'git')
    assert.equal(store.getCommitIdentitySettings().identities[0].name, 'Alice')
    assert.equal(
      store.getCommitIdentitySettings().identities[0].email,
      lookupPreferredEmail(alice)
    )
    store.updateCommitIdentitySettings('desktop', [
      {
        endpoint,
        login: 'alice',
        name: 'Work author',
        email: 'work@example.com',
      },
    ])
    await store.removeAccount(alice)
    const reloaded = new AccountsStore(data, secure)
    assert.deepEqual(await reloaded.getAll(), [])
    assert.deepEqual(reloaded.getCommitIdentitySettings(), {
      mode: 'desktop',
      identities: [
        {
          endpoint,
          login: 'alice',
          name: 'Work author',
          email: 'work@example.com',
          nameOverridden: true,
          emailOverridden: true,
        },
      ],
    })
    assert.ok(
      !JSON.stringify(reloaded.getCommitIdentitySettings()).includes('secret')
    )
  })

  it('refreshes each API-derived field independently without overwriting an edit', async () => {
    const store = new AccountsStore(
      new InMemoryStore(),
      new AsyncInMemoryStore()
    )
    await store.addAccount(alice)
    store.updateCommitIdentitySettings('desktop', [
      { endpoint, login: 'alice', email: 'custom@example.com' },
    ])
    await store.addAccount(
      new Account('ALICE', endpoint, 'new-token', [], '', 1, 'New profile name')
    )
    assert.deepEqual(store.getCommitIdentitySettings().identities, [
      {
        endpoint,
        login: 'ALICE',
        name: 'New profile name',
        email: 'custom@example.com',
        nameOverridden: false,
        emailOverridden: true,
      },
    ])
    store.updateCommitIdentitySettings('desktop', [
      { endpoint, login: 'alice', name: 'Custom name' },
    ])
    await store.addAccount(
      new Account(
        'alice',
        endpoint,
        'newer-token',
        [],
        '',
        1,
        'Another profile name'
      )
    )
    assert.equal(
      store.getCommitIdentitySettings().identities[0].name,
      'Custom name'
    )
  })

  it('uses the login fallback and privacy-aware email on each supported host', async () => {
    const store = new AccountsStore(
      new InMemoryStore(),
      new AsyncInMemoryStore()
    )
    for (const host of [
      endpoint,
      'https://enterprise.example.com/api/v3',
      'https://api.example.ghe.com',
    ]) {
      const account = new Account(
        'alice',
        host,
        'token',
        [
          {
            email: 'private@example.com',
            primary: true,
            verified: true,
            visibility: 'private',
          },
          {
            email: 'alice@users.noreply.github.com',
            primary: false,
            verified: true,
            visibility: 'private',
          },
        ],
        '',
        1,
        ''
      )
      await store.addAccount(account)
      const identity = store
        .getCommitIdentitySettings()
        .identities.find(i => i.endpoint === host)
      assert.equal(identity?.name, 'alice')
      assert.equal(identity?.email, lookupPreferredEmail(account))
    }
  })

  it('rejects invalid edits without changing persisted preferences', async () => {
    const store = new AccountsStore(
      new InMemoryStore(),
      new AsyncInMemoryStore()
    )
    await store.addAccount(alice)
    const previous = store.getCommitIdentitySettings()
    for (const edit of [{ name: '' }, { email: '' }, { email: 'bad\nvalue' }]) {
      assert.throws(
        () =>
          store.updateCommitIdentitySettings('desktop', [
            { endpoint, login: 'alice', ...edit },
          ]),
        /valid commit name and email/
      )
      assert.deepEqual(store.getCommitIdentitySettings(), previous)
    }
  })
})
