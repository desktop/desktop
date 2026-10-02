import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'
import { Account } from '../../../src/models/account'
import { InvalidatedToken } from '../../../src/ui/invalidated-token/invalidated-token'
import type { Dispatcher } from '../../../src/ui/dispatcher'
import { fireEvent, render, screen } from '../../helpers/ui/render'

describe('invalidated account credentials', () => {
  it('identifies the account that must sign in again', async t => {
    const electron = await import('electron')
    const originalSend = electron.ipcRenderer.send
    electron.ipcRenderer.send = () => {}
    t.after(() => {
      electron.ipcRenderer.send = originalSend
    })
    const account = new Account(
      'alex',
      'https://api.github.com',
      'revoked',
      [],
      '',
      2,
      ''
    )
    const showDotComSignInDialog =
      t.mock.fn<Dispatcher['showDotComSignInDialog']>()
    const dispatcher = {
      showDotComSignInDialog,
    } as unknown as Dispatcher
    render(
      <InvalidatedToken
        account={account}
        dispatcher={dispatcher}
        onDismissed={() => {}}
      />
    )
    assert.ok(screen.getByText(/token for @alex/))
    fireEvent.click(screen.getByRole('button', { name: 'Yes', hidden: true }))
    assert.strictEqual(showDotComSignInDialog.mock.callCount(), 1)
    assert.strictEqual(
      showDotComSignInDialog.mock.calls[0].arguments[1],
      account.login
    )
  })
})
