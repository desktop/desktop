import { describe, it } from 'node:test'
import assert from 'node:assert'
import * as React from 'react'
import { render, screen, fireEvent } from '../../helpers/ui/render'
import { Accounts } from '../../../src/ui/preferences/accounts'
import { Account } from '../../../src/models/account'

const account = (login: string, endpoint: string, id: number) =>
  new Account(login, endpoint, 'token', [], '', id, login)

describe('Accounts preferences', () => {
  it('shows same-host accounts separately and keeps the add action', () => {
    let signInRequests = 0
    const accounts = [
      account('work', 'https://api.github.com', 1),
      account('personal', 'https://api.github.com', 2),
    ]

    render(
      <Accounts
        accounts={accounts}
        onDotComSignIn={() => signInRequests++}
        onEnterpriseSignIn={() => {}}
        onLogout={() => {}}
        onManageRepositories={() => {}}
      />
    )

    assert.ok(screen.getByText('@work'))
    assert.ok(screen.getByText('@personal'))
    assert.equal(screen.getAllByRole('button', { name: /Sign out/i }).length, 2)
    fireEvent.click(
      screen.getByRole('button', { name: 'Add GitHub.com account' })
    )
    assert.strictEqual(signInRequests, 1)
  })

  it('groups enterprise accounts under their hostnames', () => {
    render(
      <Accounts
        accounts={[
          account('first', 'https://git.example.com/api/v3', 1),
          account('second', 'https://git.example.com/api/v3', 2),
          account('third', 'https://other.example.com/api/v3', 3),
        ]}
        onDotComSignIn={() => {}}
        onEnterpriseSignIn={() => {}}
        onLogout={() => {}}
        onManageRepositories={() => {}}
      />
    )

    assert.ok(screen.getByRole('heading', { name: 'git.example.com' }))
    assert.ok(screen.getByRole('heading', { name: 'other.example.com' }))
    assert.ok(screen.getByText('@first'))
    assert.ok(screen.getByText('@second'))
    assert.ok(screen.getByText('@third'))
  })
})
