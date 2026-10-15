import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'
import { Account } from '../../../src/models/account'
import { Accounts } from '../../../src/ui/preferences/accounts'
import { fireEvent, render, screen } from '../../helpers/ui/render'

describe('Accounts preferences', () => {
  it('shows all accounts on each endpoint and supports adding and signing out individually', () => {
    const accounts = [
      new Account(
        'personal',
        'https://api.github.com',
        'token',
        [],
        '',
        1,
        'Personal'
      ),
      new Account('work', 'https://api.github.com', 'token', [], '', 2, 'Work'),
      new Account(
        'enterprise-one',
        'https://enterprise.example.com/api/v3',
        'token',
        [],
        '',
        1,
        'Enterprise one'
      ),
      new Account(
        'enterprise-two',
        'https://enterprise.example.com/api/v3',
        'token',
        [],
        '',
        2,
        'Enterprise two'
      ),
    ]
    let dotComSignIns = 0
    let enterpriseSignIns = 0
    const signedOut: Account[] = []
    render(
      <Accounts
        accounts={accounts}
        onDotComSignIn={() => dotComSignIns++}
        onEnterpriseSignIn={() => enterpriseSignIns++}
        onLogout={account => signedOut.push(account)}
      />
    )

    for (const account of accounts) {
      assert.ok(screen.getByText(`@${account.login}`, { exact: false }))
    }
    fireEvent.click(
      screen.getByRole('button', { name: 'Add GitHub.com account' })
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Add GitHub Enterprise account' })
    )
    assert.strictEqual(dotComSignIns, 1)
    assert.strictEqual(enterpriseSignIns, 1)

    const signOutButtons = screen.getAllByRole('button', { name: /sign out/i })
    assert.strictEqual(signOutButtons.length, accounts.length)
    fireEvent.click(signOutButtons[1])
    assert.deepStrictEqual(signedOut, [accounts[1]])
  })

  it('shows the original sign-in actions when there are no accounts', () => {
    render(
      <Accounts
        accounts={[]}
        onDotComSignIn={() => {}}
        onEnterpriseSignIn={() => {}}
        onLogout={() => {}}
      />
    )
    assert.ok(screen.getByRole('button', { name: /sign into github.com/i }))
    assert.ok(
      screen.getByRole('button', { name: /sign into github enterprise/i })
    )
  })
})
