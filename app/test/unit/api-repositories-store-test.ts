import assert from 'node:assert'
import { afterEach, describe, it, mock } from 'node:test'

import { API, getDotComAPIEndpoint, IAPIRepository } from '../../src/lib/api'
import { Account } from '../../src/models/account'
import { ApiRepositoriesStore } from '../../src/lib/stores/api-repositories-store'
import { AccountsStore } from '../../src/lib/stores'
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

function createRepository(name: string): IAPIRepository {
  return {
    clone_url: `https://github.com/desktop/${name}.git`,
    ssh_url: `git@github.com:desktop/${name}.git`,
    html_url: `https://github.com/desktop/${name}`,
    name,
    owner: {
      id: 1,
      login: 'desktop',
      avatar_url: '',
      html_url: 'https://github.com/desktop',
      type: 'Organization',
    },
    private: false,
    fork: false,
    default_branch: 'main',
    pushed_at: new Date(0).toISOString(),
    has_issues: true,
    archived: false,
  }
}

describe('ApiRepositoriesStore', () => {
  afterEach(() => mock.restoreAll())

  it('discards repository pages returned after the account is switched', async () => {
    const accountsStore = new AccountsStore(
      new InMemoryStore(),
      new AsyncInMemoryStore()
    )
    const repositoriesStore = new ApiRepositoriesStore(accountsStore)
    const mona = createAccount('mona', 1)
    const hubot = createAccount('hubot', 2)
    let finishMonaRequest: (() => void) | undefined
    let signalMonaRequestStarted: (() => void) | undefined
    const monaRequestStarted = new Promise<void>(
      resolve => (signalMonaRequestStarted = resolve)
    )

    mock.method(API, 'fromAccount', (account: Account) => {
      return {
        streamUserRepositories: async (
          addPage: (page: ReadonlyArray<IAPIRepository>) => void
        ) => {
          if (account.id === mona.id) {
            signalMonaRequestStarted?.()
            await new Promise<void>(resolve => (finishMonaRequest = resolve))
          }

          addPage([createRepository(`${account.login}-repository`)])
        },
      } as unknown as API
    })

    await accountsStore.addAccount(mona)
    const monaLoad = repositoriesStore.loadRepositories(mona)
    await monaRequestStarted
    await accountsStore.addAccount(hubot)
    finishMonaRequest?.()
    await monaLoad

    assert.equal(
      [...repositoriesStore.getState().keys()].some(
        account => account.id === mona.id
      ),
      false
    )

    await repositoriesStore.loadRepositories(hubot)
    const state = repositoriesStore.getState()
    assert.deepEqual(
      [...state.keys()].map(account => account.login),
      ['hubot']
    )
    assert.deepEqual(
      [...state.values()][0].repositories.map(repository => repository.name),
      ['hubot-repository']
    )
  })
})
