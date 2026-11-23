import assert from 'node:assert'
import { describe, it, TestContext } from 'node:test'
import * as React from 'react'
import { ipcRenderer } from 'electron'
import { ISerializableMenuItem } from '../../../src/lib/menu-item'
import { Account } from '../../../src/models/account'
import { Accounts } from '../../../src/ui/preferences/accounts'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '../../helpers/ui/render'

const account = (login: string, endpoint: string, id: number) =>
  new Account(login, endpoint, 'token', [], '', id, `Name of ${login}`)

/** Stub the contextual menu so that it picks the item at `choice.index`. */
function mockContextualMenu(t: TestContext) {
  const menus = new Array<ReadonlyArray<string | undefined>>()
  const choice = { index: 0 }
  t.mock.method(
    ipcRenderer,
    'invoke',
    async (channel: string, items: ReadonlyArray<ISerializableMenuItem>) => {
      assert.strictEqual(channel, 'show-contextual-menu')
      menus.push(items.map(i => (i.label ?? i.type)?.toLowerCase()))
      return [choice.index]
    }
  )
  return { menus, choice }
}

function renderAccounts(
  accounts: ReadonlyArray<Account>,
  props: Partial<React.ComponentProps<typeof Accounts>> = {}
) {
  return render(
    <Accounts
      accounts={accounts}
      onDotComSignIn={() => {}}
      onEnterpriseSignIn={() => {}}
      onLogout={() => {}}
      onManageRepositories={() => {}}
      {...props}
    />
  )
}

describe('Accounts preferences', () => {
  it('lists every account in one list, GitHub.com first then by host', () => {
    const accounts = [
      account('zeta-one', 'https://zeta.example.com/api/v3', 1),
      account('personal', 'https://api.github.com', 2),
      account('alpha-one', 'https://alpha.example.com/api/v3', 3),
      account('custom-port', 'https://zeta.example.com:8443/api/v3', 4),
      account('zeta-two', 'https://zeta.example.com/api/v3', 5),
      account('work', 'https://api.github.com', 6),
      account('tenant-one', 'https://api.tenant.ghe.com', 7),
    ]
    renderAccounts(accounts)

    assert.strictEqual(screen.queryAllByRole('heading', { level: 3 }).length, 0)
    const list = screen.getByRole('list', { name: 'Accounts' })
    const rows = within(list)
      .getAllByRole('listitem')
      .map(row => row.querySelector('.login')?.textContent)
    assert.deepStrictEqual(rows, [
      '@personal · GitHub.com',
      '@work · GitHub.com',
      '@alpha-one · alpha.example.com',
      '@tenant-one · tenant.ghe.com',
      '@zeta-one · zeta.example.com',
      '@zeta-two · zeta.example.com',
      '@custom-port · zeta.example.com:8443',
    ])
  })

  it('adds GitHub.com or GitHub Enterprise accounts from the Add account menu', async t => {
    const { menus, choice } = mockContextualMenu(t)
    let dotCom = 0
    let enterprise = 0
    renderAccounts([account('personal', 'https://api.github.com', 1)], {
      onDotComSignIn: () => dotCom++,
      onEnterpriseSignIn: () => enterprise++,
    })

    const add = screen.getByRole('button', { name: /add account/i })
    choice.index = 0
    fireEvent.click(add)
    await waitFor(() => assert.strictEqual(dotCom, 1))
    choice.index = 1
    fireEvent.click(add)
    await waitFor(() => assert.strictEqual(enterprise, 1))

    assert.strictEqual(dotCom, 1)
    assert.deepStrictEqual(menus, [
      ['github.com', 'github enterprise'],
      ['github.com', 'github enterprise'],
    ])
  })

  it('manages repositories and signs out from each account menu', async t => {
    const { menus, choice } = mockContextualMenu(t)
    const accounts = [
      account('personal', 'https://api.github.com', 1),
      account('work', 'https://enterprise.example.com/api/v3', 2),
    ]
    const signedOut: Account[] = []
    const managed: Account[] = []
    renderAccounts(accounts, {
      onLogout: a => signedOut.push(a),
      onManageRepositories: a => managed.push(a),
    })

    assert.strictEqual(
      screen.queryByRole('button', { name: /sign out|manage repositories/i }),
      null
    )

    choice.index = 2
    fireEvent.click(screen.getByRole('button', { name: 'Actions for @work' }))
    await waitFor(() => assert.deepStrictEqual(signedOut, [accounts[1]]))

    choice.index = 0
    fireEvent.click(
      screen.getByRole('button', { name: 'Actions for @personal' })
    )
    await waitFor(() => assert.deepStrictEqual(managed, [accounts[0]]))

    assert.deepStrictEqual(signedOut, [accounts[1]])
    assert.deepStrictEqual(menus, [
      ['manage repositories…', 'separator', 'sign out'],
      ['manage repositories…', 'separator', 'sign out'],
    ])
  })

  it('shows an empty state and the Add account action when there are no accounts', () => {
    renderAccounts([])
    assert.ok(screen.getByText(/not signed in to any accounts/i))
    assert.strictEqual(screen.queryByRole('list'), null)
    assert.ok(screen.getByRole('button', { name: /add account/i }))
  })
})
