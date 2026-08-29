import assert from 'node:assert'
import * as Path from 'path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { ipcRenderer } from 'electron'

import { getDotComAPIEndpoint, IAPIRepository } from '../../../src/lib/api'
import { IAccountRepositories } from '../../../src/lib/stores/api-repositories-store'
import { Account, IAccountMetadata } from '../../../src/models/account'
import { CloneRepositoryTab } from '../../../src/models/clone-repository-tab'
import { CloneRepository } from '../../../src/ui/clone-repository/clone-repository'
import { Dispatcher } from '../../../src/ui/dispatcher'

const electronIpc = ipcRenderer as any
let originalInvoke: unknown

beforeEach(() => {
  originalInvoke = electronIpc.invoke
  electronIpc.invoke = async () => 'C:\\Documents'
})

afterEach(() => {
  electronIpc.invoke = originalInvoke
})

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

describe('CloneRepository account switching', () => {
  it('clears repository state from the previously active account', async () => {
    const mona = createAccount('mona', 1)
    const hubot = createAccount('hubot', 2)
    const activatedAccounts = new Array<IAccountMetadata>()
    const dispatcher = {
      setActiveAccount: async (account: IAccountMetadata) => {
        activatedAccounts.push(account)
      },
    } as unknown as Dispatcher
    const oldPath = Path.join('C:\\repositories', 'old-repository')
    const oldRepository = {
      clone_url: 'https://github.com/mona/old-repository.git',
    } as IAPIRepository
    const component = new CloneRepository({
      dispatcher,
      onDismissed: () => {},
      accounts: [mona],
      allAccounts: [mona, hubot],
      initialURL: null,
      selectedTab: CloneRepositoryTab.DotCom,
      onTabSelected: () => {},
      apiRepositories: new Map<Account, IAccountRepositories>(),
      onRefreshRepositories: () => {},
      isTopMost: false,
    })
    const cloneRepository = component as any

    // React's unmounted updater is intentionally a no-op. Replace it with a
    // synchronous updater so this test can exercise the state transition
    // without mounting the surrounding Electron dialog.
    cloneRepository.setState = (update: any, callback?: () => void) => {
      const nextState =
        typeof update === 'function'
          ? update(cloneRepository.state, cloneRepository.props)
          : update
      cloneRepository.state = { ...cloneRepository.state, ...nextState }
      callback?.()
    }
    await new Promise<void>(resolve => setImmediate(resolve))

    cloneRepository.state = {
      ...cloneRepository.state,
      dotComTabState: {
        ...cloneRepository.state.dotComTabState,
        selectedAccount: mona,
        selectedItem: oldRepository,
        filterText: 'old-repository',
        error: new Error('old account error'),
        lastParsedIdentifier: {
          hostname: 'github.com',
          owner: 'mona',
          name: 'old-repository',
        },
        path: oldPath,
        url: oldRepository.clone_url,
      },
    }

    await cloneRepository.onSelectedAccountChanged(hubot)

    const tabState = cloneRepository.state.dotComTabState
    assert.deepEqual(activatedAccounts, [hubot])
    assert.equal(tabState.selectedAccount, hubot)
    assert.equal(tabState.selectedItem, null)
    assert.equal(tabState.filterText, '')
    assert.equal(tabState.error, null)
    assert.equal(tabState.lastParsedIdentifier, null)
    assert.equal(tabState.path, Path.dirname(oldPath))
    assert.equal(tabState.url, '')
  })
})
