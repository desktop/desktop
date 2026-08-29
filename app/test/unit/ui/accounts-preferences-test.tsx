import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { getDotComAPIEndpoint } from '../../../src/lib/api'
import { Account, IAccountMetadata } from '../../../src/models/account'
import { Accounts } from '../../../src/ui/preferences/accounts'
import { fireEvent, render, screen } from '../../helpers/ui/render'

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

describe('Accounts preferences', () => {
  it('shows stored accounts and switches to an inactive account', () => {
    const mona = createAccount('mona', 1)
    const hubot = createAccount('hubot', 2)
    const activatedAccounts = new Array<IAccountMetadata>()
    const loggedOutAccounts = new Array<IAccountMetadata>()
    let dotComSignInCount = 0

    render(
      <Accounts
        accounts={[mona, hubot]}
        activeAccounts={[mona]}
        onDotComSignIn={() => dotComSignInCount++}
        onEnterpriseSignIn={() => {}}
        onSetActiveAccount={account => activatedAccounts.push(account)}
        onLogout={account => loggedOutAccounts.push(account)}
      />
    )

    assert.equal(screen.getAllByText('Active account').length, 1)
    assert.equal(screen.queryByRole('button', { name: 'Switch to mona' }), null)

    fireEvent.click(screen.getByRole('button', { name: 'Switch to hubot' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sign out hubot' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Add GitHub.com account' })
    )

    assert.deepEqual(activatedAccounts, [hubot])
    assert.deepEqual(loggedOutAccounts, [hubot])
    assert.equal(dotComSignInCount, 1)
  })
})
