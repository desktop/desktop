import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as React from 'react'
import { Account } from '../../../src/models/account'
import { Owner } from '../../../src/models/owner'
import { GitHubRepository } from '../../../src/models/github-repository'
import { Repository } from '../../../src/models/repository'
import { getDotComAPIEndpoint } from '../../../src/lib/api'
import { RepositoriesStore } from '../../../src/lib/stores/repositories-store'
import { generateRepositoryListContextMenu } from '../../../src/ui/repositories-list/repository-list-item-context-menu'
import {
  RepositorySettings,
  RepositorySettingsTab,
} from '../../../src/ui/repository-settings/repository-settings'
import type { Dispatcher } from '../../../src/ui/dispatcher'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'
import { TestRepositoriesDatabase } from '../../helpers/databases'

const endpoint = getDotComAPIEndpoint()
const alice = new Account('alice', endpoint, 'token', [], '', 1, 'Alice')
const bob = new Account('bob', endpoint, 'token', [], '', 2, 'Bob')
const enterprise = new Account(
  'carol',
  'https://enterprise.example.com/api/v3',
  'token',
  [],
  '',
  3,
  'Carol'
)

class TestResizeObserver implements ResizeObserver {
  public constructor(private readonly callback: ResizeObserverCallback) {}
  public observe(target: Element) {
    Object.defineProperty(target, 'offsetWidth', {
      configurable: true,
      value: 400,
    })
    Object.defineProperty(target, 'offsetHeight', {
      configurable: true,
      value: 400,
    })
    this.callback(
      [
        {
          target,
          contentRect: {
            x: 0,
            y: 0,
            width: 400,
            height: 400,
            top: 0,
            right: 400,
            bottom: 400,
            left: 0,
            toJSON: () => ({}),
          },
          borderBoxSize: [],
          contentBoxSize: [],
          devicePixelContentBoxSize: [],
        },
      ],
      this
    )
  }
  public unobserve() {}
  public disconnect() {}
}

const createRepository = (
  identity: Repository['accountIdentity'] = {
    endpoint,
    id: alice.id,
  }
) =>
  new Repository(
    '.',
    33,
    new GitHubRepository('desktop', new Owner('owner', endpoint, 42), 3),
    false,
    null,
    {},
    false,
    undefined,
    undefined,
    identity
  )

const menu = (
  repository: Repository,
  knownAccounts: ReadonlyArray<Account>,
  accounts: ReadonlyArray<Account>,
  onSelected: (account: Account) => void = () => {}
) =>
  generateRepositoryListContextMenu({
    repository,
    knownAccounts,
    accounts,
    onSelectedAccount: onSelected,
    shellLabel: undefined,
    externalEditorLabel: undefined,
    askForConfirmationOnRemoveRepository: false,
    onViewOnGitHub: () => {},
    onOpenInShell: () => {},
    onShowRepository: () => {},
    onOpenInExternalEditor: () => {},
    onRemoveRepository: () => {},
    onChangeRepositoryAlias: () => {},
    onRemoveRepositoryAlias: () => {},
  })

describe('Repository account context menu', () => {
  it('lists eligible signed-in accounts without an unassociated option', () => {
    let selected: Account | null = null
    const items = menu(
      createRepository(),
      [alice, bob, enterprise],
      [alice, bob, enterprise],
      account => (selected = account)
    )
    const accounts = items.find(item => item.label === 'Accounts')
    assert.deepEqual(
      accounts?.submenu?.map(item => item.label),
      ['alice', 'bob']
    )
    assert.equal(accounts?.submenu?.[0].checked, true)
    accounts?.submenu?.[1].action?.()
    assert.equal(selected, bob)
  })

  it('checks the signed-out current identity and allows a signed-in replacement', () => {
    let selected: Account | null = null
    const accounts = menu(createRepository(), [alice, bob], [bob], account => {
      selected = account
    }).find(item => item.label === 'Accounts')

    assert.deepEqual(
      accounts?.submenu?.map(item => item.label),
      ['alice (Signed out)', 'bob']
    )
    assert.equal(accounts?.submenu?.[0].checked, true)
    assert.equal(accounts?.submenu?.[0].enabled, false)
    accounts?.submenu?.[1].action?.()
    assert.equal(selected, bob)
  })

  it('hides the submenu when only one identity is retained', () => {
    assert.equal(
      menu(createRepository(), [alice], [alice]).find(
        item => item.label === 'Accounts'
      ),
      undefined
    )
  })

  it('hides the submenu for an unassociated repository with no eligible signed-in account', () => {
    assert.equal(
      menu(createRepository(null), [alice, bob], [enterprise]).find(
        item => item.label === 'Accounts'
      ),
      undefined
    )
  })
})

describe('Repository Settings account association', () => {
  const originalWillMount = RepositorySettings.prototype.componentWillMount
  let restoreIpcSend: (() => void) | undefined
  let originalResizeObserver: typeof window.ResizeObserver
  let originalGlobalResizeObserver: typeof globalThis.ResizeObserver
  beforeEach(async () => {
    originalResizeObserver = window.ResizeObserver
    originalGlobalResizeObserver = globalThis.ResizeObserver
    Object.assign(globalThis, { ResizeObserver: TestResizeObserver })
    Object.assign(window, { ResizeObserver: TestResizeObserver })
    const electron = await import('electron')
    const previousSend = electron.ipcRenderer.send
    electron.ipcRenderer.send = () => {}
    restoreIpcSend = () => {
      electron.ipcRenderer.send = previousSend
    }
  })
  afterEach(() => {
    RepositorySettings.prototype.componentWillMount = originalWillMount
    restoreIpcSend?.()
    Object.assign(window, { ResizeObserver: originalResizeObserver })
    Object.assign(globalThis, { ResizeObserver: originalGlobalResizeObserver })
  })

  it('persists the selected account on Save', async () => {
    RepositorySettings.prototype.componentWillMount = async () => {}
    const database = new TestRepositoriesDatabase()
    await database.reset()
    const store = new RepositoriesStore(database)
    const added = await store.addRepository('.', './.git')
    await store.setRepositoryAccount(added, alice)
    const repository = new Repository(
      added.path,
      added.id,
      new GitHubRepository('desktop', new Owner('owner', endpoint, 42), 3),
      false,
      null,
      {},
      false,
      undefined,
      undefined,
      { endpoint, id: alice.id }
    )
    const changes: Array<[Repository, Account | null]> = []
    let dismissed = false
    const dispatcher = {
      setRepositoryAccount: async (
        repo: Repository,
        account: Account | null
      ) => {
        changes.push([repo, account])
        return store.setRepositoryAccount(repo, account)
      },
      updateRepositoryWorkflowPreferences: async () => {},
    } as unknown as Dispatcher

    const view = render(
      <RepositorySettings
        initialSelectedTab={RepositorySettingsTab.Remote}
        dispatcher={dispatcher}
        remote={{ name: 'origin', url: 'https://github.com/owner/desktop' }}
        repository={repository}
        repositoryAccount={alice}
        accounts={[alice, bob, enterprise]}
        onDismissed={() => (dismissed = true)}
      />
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Account', hidden: true })
    )
    await waitFor(() =>
      assert.ok(
        view.container.querySelectorAll('.account-list-item').length > 1
      )
    )
    fireEvent.click(view.container.querySelectorAll('.account-list-item')[1])
    fireEvent.click(screen.getByRole('button', { name: 'Save', hidden: true }))
    await waitFor(() => assert.equal(dismissed, true))
    assert.deepEqual(changes, [[repository, bob]])
    assert.deepEqual(
      (await database.repositories.get(added.id))?.accountIdentity,
      { endpoint, id: bob.id }
    )
  })
})
