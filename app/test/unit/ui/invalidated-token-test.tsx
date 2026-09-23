import { afterEach, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as React from 'react'
import { InvalidatedToken } from '../../../src/ui/invalidated-token/invalidated-token'
import { Accounts } from '../../../src/ui/preferences/accounts'
import { Account } from '../../../src/models/account'
import { DialogStackContext } from '../../../src/ui/dialog/dialog'
import { render, screen, fireEvent, waitFor } from '../../helpers/ui/render'

describe('Session recovery dialog', () => {
  let view: ReturnType<typeof render> | undefined
  let restoreIpc: (() => void) | undefined
  beforeEach(async () => {
    const electron = await import('electron')
    const previousSend = electron.ipcRenderer.send
    electron.ipcRenderer.send = () => {}
    const showModal = Object.getOwnPropertyDescriptor(
      HTMLDialogElement.prototype,
      'showModal'
    )
    const close = Object.getOwnPropertyDescriptor(
      HTMLDialogElement.prototype,
      'close'
    )
    HTMLDialogElement.prototype.showModal = function () {
      this.open = true
    }
    HTMLDialogElement.prototype.close = function () {
      this.open = false
    }
    restoreIpc = () => {
      electron.ipcRenderer.send = previousSend
      for (const [key, descriptor] of [
        ['showModal', showModal],
        ['close', close],
      ] as const) {
        if (descriptor === undefined) {
          Reflect.deleteProperty(HTMLDialogElement.prototype, key)
        } else {
          Object.defineProperty(HTMLDialogElement.prototype, key, descriptor)
        }
      }
    }
  })
  afterEach(() => {
    view?.unmount()
    view = undefined
    restoreIpc?.()
  })
  for (const endpoint of [
    'https://api.github.com',
    'https://github.example.com/api/v3',
  ]) {
    it(`offers explicit sign-in without claiming local work is lost (${endpoint})`, () => {
      const actions: string[] = []
      const dispatcher = {
        showDotComSignInDialog: async () => {
          actions.push('dotcom')
        },
        showEnterpriseSignInDialog: async (url?: string) => {
          actions.push(url ?? '')
        },
      }
      view = render(
        <InvalidatedToken
          account={new Account('octocat', endpoint, '', [], '', 1, 'Octocat')}
          dispatcher={dispatcher}
          onDismissed={() => actions.push('dismiss')}
        />
      )
      assert.ok(
        screen.getByText(/local repositories and changes are not affected/)
      )
      fireEvent.click(
        screen.getByRole('button', { name: 'Sign in', hidden: true })
      )
      assert.deepEqual(actions, [
        'dismiss',
        endpoint === 'https://api.github.com'
          ? 'dotcom'
          : 'https://github.example.com',
      ])
    })
  }

  it('allows deferring sign-in without removing repositories', async () => {
    let dismissed = 0
    let signIns = 0
    const account = new Account(
      'octocat',
      'https://api.github.com',
      '',
      [],
      '',
      1,
      'Octocat'
    )
    view = render(
      <DialogStackContext.Provider value={{ isTopMost: true }}>
        <InvalidatedToken
          account={account}
          dispatcher={{
            showDotComSignInDialog: () => assert.fail('Unexpected sign-in'),
            showEnterpriseSignInDialog: () => assert.fail('Unexpected sign-in'),
          }}
          onDismissed={() => dismissed++}
        />
      </DialogStackContext.Provider>
    )
    await waitFor(() => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Not now', hidden: true })
      )
      assert.equal(dismissed, 1)
    })
    view.rerender(
      <Accounts
        accounts={[account]}
        onDotComSignIn={() => signIns++}
        onEnterpriseSignIn={() => assert.fail('Unexpected Enterprise sign-in')}
        onLogout={() => assert.fail('Recovery must not require signing out')}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /sign in again/i }))
    assert.equal(signIns, 1)
  })
})
