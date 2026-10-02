import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'
import { getDotComAPIEndpoint } from '../../../src/lib/api'
import { Account } from '../../../src/models/account'
import { Accounts } from '../../../src/ui/preferences/accounts'
import { fireEvent, render, screen } from '../../helpers/ui/render'

describe('Account settings', () => {
  const dotComEndpoint = getDotComAPIEndpoint()
  const accounts = [
    new Account('joan', dotComEndpoint, 'one', [], '', 1, 'Joan'),
    new Account('alex', dotComEndpoint, 'two', [], '', 2, 'Alex'),
    new Account(
      'sam',
      'https://enterprise.example.com/api/v3',
      'three',
      [],
      '',
      3,
      'Sam'
    ),
    new Account(
      'pat',
      'https://enterprise.example.com/api/v3',
      'four',
      [],
      '',
      4,
      'Pat'
    ),
  ]

  it('shows every GitHub.com account and allows adding another', () => {
    let signInRequests = 0
    render(
      <Accounts
        accounts={accounts}
        onDotComSignIn={() => signInRequests++}
        onEnterpriseSignIn={() => {}}
        onLogout={() => {}}
      />
    )

    assert.ok(screen.getByText('@joan'))
    assert.ok(screen.getByText('@alex'))
    fireEvent.click(
      screen.getByRole('button', { name: 'Add GitHub.com account' })
    )
    assert.strictEqual(signInRequests, 1)
  })

  it('shows enterprise accounts under their hostname', () => {
    render(
      <Accounts
        accounts={accounts}
        onDotComSignIn={() => {}}
        onEnterpriseSignIn={() => {}}
        onLogout={() => {}}
      />
    )

    assert.ok(screen.getByText('@sam (Sam)'))
    assert.ok(screen.getByText('@pat (Pat)'))
    assert.ok(screen.getByRole('heading', { name: 'enterprise.example.com' }))
  })
})
