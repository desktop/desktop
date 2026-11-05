import assert from 'node:assert/strict'
import { before, describe, it, mock } from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { Account } from '../../src/models/account'
import { API } from '../../src/lib/api'
import { AccountsStore } from '../../src/lib/stores/accounts-store'
import type { AliveStore } from '../../src/lib/stores/alive-store'
import { createMockAPI } from '../helpers/mock-api'
import { AsyncInMemoryStore, InMemoryStore } from '../helpers/stores'

class FakeAliveSession {
  public static readonly instances = new Array<FakeAliveSession>()

  public readonly topics = new Array<string>()
  public isOffline = false

  public constructor(public readonly url: string) {
    FakeAliveSession.instances.push(this)
  }

  public subscribe(subscriptions: ReadonlyArray<{ topic: { name: string } }>) {
    this.topics.push(...subscriptions.map(s => s.topic.name))
  }

  public unsubscribe(
    subscriptions: ReadonlyArray<{ topic: { name: string } }>
  ) {
    for (const { topic } of subscriptions) {
      this.topics.splice(this.topics.indexOf(topic.name), 1)
    }
  }

  public offline() {
    this.isOffline = true
  }
}

async function waitFor(condition: () => boolean) {
  for (let i = 0; i < 100 && !condition(); i++) {
    await setImmediate()
  }
  assert.ok(condition())
}

describe('AliveStore', () => {
  let AliveStoreClass: typeof AliveStore

  before(async () => {
    mock.module('@github/alive-client', {
      namedExports: { AliveSession: FakeAliveSession },
    })
    AliveStoreClass = (await import('../../src/lib/stores/alive-store'))
      .AliveStore
  })

  it('keeps a separate session for each account on the same endpoint', async t => {
    t.mock.method(API, 'fromAccount', (account: Account) =>
      createMockAPI({
        getAliveWebSocketURL: async () => `wss://alive/${account.login}`,
        getAliveDesktopChannel: async () => ({
          channel_name: account.login,
          signed_channel: `signed-${account.login}`,
        }),
      })
    )
    const endpoint = 'https://api.github.com'
    const alice = new Account('alice', endpoint, 'a', [], '', 1, '')
    const bob = new Account('bob', endpoint, 'b', [], '', 2, '')
    const accountsStore = new AccountsStore(
      new InMemoryStore(),
      new AsyncInMemoryStore()
    )
    await accountsStore.addAccount(alice)
    await accountsStore.addAccount(bob)

    const aliveStore = new AliveStoreClass(accountsStore)
    aliveStore.setEnabled(true)
    await waitFor(() => FakeAliveSession.instances.length === 2)
    const [aliceSession, bobSession] = FakeAliveSession.instances
    await waitFor(() => bobSession.topics.length === 1)
    assert.deepStrictEqual(
      FakeAliveSession.instances.map(s => [s.url, s.topics]),
      [
        ['wss://alive/alice', ['alice']],
        ['wss://alive/bob', ['bob']],
      ]
    )

    await accountsStore.removeAccount(alice)
    await waitFor(() => aliceSession.isOffline)
    assert.strictEqual(bobSession.isOffline, false)
    assert.deepStrictEqual(bobSession.topics, ['bob'])
  })
})
