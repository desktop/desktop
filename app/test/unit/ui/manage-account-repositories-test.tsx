import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as React from 'react'
import { Account } from '../../../src/models/account'
import { GitHubRepository } from '../../../src/models/github-repository'
import { Owner } from '../../../src/models/owner'
import { Repository } from '../../../src/models/repository'
import { getDotComAPIEndpoint } from '../../../src/lib/api'
import { ManageAccountRepositories } from '../../../src/ui/manage-account-repositories'
import { getRepositoriesOnAccountHost } from '../../../src/lib/get-repositories-on-account-host'
import { Accounts } from '../../../src/ui/preferences/accounts'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

const endpoint = getDotComAPIEndpoint()
const newAccount = new Account('alex', endpoint, 'token', [], '', 2, 'Alex')
const previous = new Account('sam', endpoint, '', [], '', 1, 'Sam')
const enterprise = new Account(
  'pat',
  'https://enterprise.example.com/api/v3',
  'token',
  [],
  '',
  3,
  'Pat'
)

const repository = (
  id: number,
  identity: Repository['accountIdentity'],
  host = endpoint
) =>
  new Repository(
    `repository-${id}`,
    id,
    new GitHubRepository('project', new Owner('owner', host, 55), id),
    false,
    null,
    {},
    false,
    undefined,
    undefined,
    identity
  )

describe('Manage account repositories', () => {
  let restoreSend: (() => void) | undefined
  beforeEach(async () => {
    const electron = await import('electron')
    const send = electron.ipcRenderer.send
    electron.ipcRenderer.send = () => {}
    restoreSend = () => {
      electron.ipcRenderer.send = send
    }
  })
  afterEach(() => restoreSend?.())

  it('lists every tracked repository on the host with its current association, regardless of access', () => {
    const unassociated = repository(1, null)
    const associated = repository(2, { endpoint, id: previous.id })
    const inaccessible = repository(3, { endpoint, id: newAccount.id })
    const otherHost = repository(4, null, enterprise.endpoint)
    const local = new Repository('local', 5, null, false)
    const view = render(
      <ManageAccountRepositories
        account={newAccount}
        repositories={[
          unassociated,
          associated,
          inaccessible,
          otherHost,
          local,
        ]}
        knownAccounts={[previous, newAccount, enterprise]}
        onAssign={async () => {}}
        onDismissed={() => {}}
      />
    )

    assert.equal(
      view.container.querySelectorAll('input[type="checkbox"]').length,
      3
    )
    assert.ok(screen.getByText('Unassociated'))
    assert.ok(screen.getByText('@sam (Signed out)'))
    assert.ok(screen.getByText('@alex'))
    assert.equal(screen.queryByText('repository-4'), null)
    assert.equal(screen.queryByText('local'), null)
  })

  it('includes unassociated repositories with a matching remote even without API access', () => {
    const local = new Repository(
      'local',
      5,
      null,
      false,
      null,
      {},
      false,
      undefined,
      undefined,
      null
    )
    const other = new Repository('other', 6, null, false)
    assert.deepEqual(
      getRepositoriesOnAccountHost(
        newAccount,
        [local, other],
        new Map([
          [local.id, 'git@github.com:owner/local.git'],
          [other.id, 'https://enterprise.example.com/owner/other.git'],
        ])
      ),
      [local]
    )
  })

  it('shows an empty state without an assignment action when the account host has no tracked repositories', () => {
    let dismissed = false
    render(
      <ManageAccountRepositories
        account={newAccount}
        repositories={[repository(4, null, enterprise.endpoint)]}
        knownAccounts={[newAccount, enterprise]}
        onAssign={async () => {}}
        onDismissed={() => (dismissed = true)}
      />
    )

    assert.ok(screen.getByText('No repositories to assign on this host.'))
    assert.equal(
      screen.queryByRole('button', { name: 'Assign selected', hidden: true }),
      null
    )
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Close', hidden: true })[1]
    )
    assert.equal(dismissed, true)
  })

  it('assigns only checked repositories to the target account', async () => {
    const first = repository(1, null)
    const second = repository(2, { endpoint, id: previous.id })
    const third = repository(3, { endpoint, id: newAccount.id })
    const assigned: Repository[] = []
    let dismissed = false
    const view = render(
      <ManageAccountRepositories
        account={newAccount}
        repositories={[first, second, third]}
        knownAccounts={[previous, newAccount]}
        onAssign={async repo => {
          assigned.push(repo)
        }}
        onDismissed={() => (dismissed = true)}
      />
    )

    const checkboxes = view.container.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"]'
    )
    assert.deepEqual(
      Array.from(checkboxes, checkbox => checkbox.checked),
      [false, false, false]
    )
    fireEvent.click(checkboxes[0])
    fireEvent.click(checkboxes[1])
    fireEvent.click(
      screen.getByRole('button', { name: 'Assign selected', hidden: true })
    )
    await waitFor(() => assert.equal(dismissed, true))
    assert.deepEqual(assigned, [first, second])
  })

  it('opens management again from Account settings', () => {
    let selected: Account | null = null
    render(
      <Accounts
        accounts={[newAccount]}
        onDotComSignIn={() => {}}
        onEnterpriseSignIn={() => {}}
        onLogout={() => {}}
        onManageRepositories={account => (selected = account)}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Manage repositories' }))
    assert.equal(selected, newAccount)
  })
})
