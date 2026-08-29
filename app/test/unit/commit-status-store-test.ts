import assert from 'node:assert'
import { afterEach, describe, it, mock } from 'node:test'

import { API, getDotComAPIEndpoint } from '../../src/lib/api'
import { ICombinedRefCheck } from '../../src/lib/ci-checks/ci-checks'
import { Account } from '../../src/models/account'
import { GitHubRepository } from '../../src/models/github-repository'
import { Owner } from '../../src/models/owner'
import { AccountsStore } from '../../src/lib/stores'
import { CommitStatusStore } from '../../src/lib/stores/commit-status-store'
import { AsyncInMemoryStore, InMemoryStore } from '../helpers/stores'

function createAccount(login: string, id: number) {
  return new Account(
    login,
    getDotComAPIEndpoint(),
    `${login}-token`,
    [],
    '',
    id,
    login,
    'free'
  )
}

describe('CommitStatusStore', () => {
  afterEach(() => mock.restoreAll())

  it('discards commit status returned after the account is switched', async () => {
    const accountsStore = new AccountsStore(
      new InMemoryStore(),
      new AsyncInMemoryStore()
    )
    const mona = createAccount('mona', 1)
    const hubot = createAccount('hubot', 2)
    await accountsStore.addAccount(mona)

    const statusStore = new CommitStatusStore(accountsStore)
    await new Promise<void>(resolve => setImmediate(resolve))

    let finishMonaRequest: (() => void) | undefined
    let signalMonaRequestStarted: (() => void) | undefined
    let signalHubotRequestStarted: (() => void) | undefined
    const monaRequestStarted = new Promise<void>(
      resolve => (signalMonaRequestStarted = resolve)
    )
    const hubotRequestStarted = new Promise<void>(
      resolve => (signalHubotRequestStarted = resolve)
    )
    const monaRequestGate = new Promise<void>(
      resolve => (finishMonaRequest = resolve)
    )

    mock.method(API, 'fromAccount', (account: Account) => {
      if (account.id === mona.id) {
        signalMonaRequestStarted?.()
        return {
          fetchCombinedRefStatus: async () => {
            await monaRequestGate
            return {
              state: 'success',
              total_count: 1,
              statuses: [
                {
                  state: 'success',
                  target_url: null,
                  description: 'Old account status',
                  context: 'old-account-check',
                  id: 1,
                },
              ],
            }
          },
          fetchRefCheckRuns: async () => {
            await monaRequestGate
            return null
          },
        } as unknown as API
      }

      signalHubotRequestStarted?.()
      return {
        fetchCombinedRefStatus: async () => null,
        fetchRefCheckRuns: async () => null,
      } as unknown as API
    })

    const repository = new GitHubRepository(
      'desktop',
      new Owner('desktop', getDotComAPIEndpoint(), 1, 'Organization'),
      1
    )
    const updates = new Array<ICombinedRefCheck | null>()
    const subscription = statusStore.subscribe(repository, 'deadbeef', status =>
      updates.push(status)
    )

    await monaRequestStarted
    await accountsStore.addAccount(hubot)
    finishMonaRequest?.()
    await hubotRequestStarted
    await new Promise<void>(resolve => setImmediate(resolve))

    assert.equal(
      updates.some(update =>
        update?.checks.some(check => check.name === 'old-account-check')
      ),
      false
    )
    assert.equal(statusStore.tryGetStatus(repository, 'deadbeef'), null)

    subscription.dispose()
  })
})
