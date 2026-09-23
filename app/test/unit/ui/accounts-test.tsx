import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import * as React from 'react'
import { Account } from '../../../src/models/account'
import { Accounts } from '../../../src/ui/preferences/accounts'
import { AccountsStore } from '../../../src/lib/stores/accounts-store'
import { DialogPreferredFocusClassName } from '../../../src/ui/dialog'
import { InMemoryStore, AsyncInMemoryStore } from '../../helpers/stores'
import { render, screen, fireEvent } from '../../helpers/ui/render'

const signInAgain = /sign in again/i
const signOut = /sign out/i

describe('Account settings recovery', () => {
  for (const endpoint of [
    'https://api.github.com',
    'https://github.example.com/api/v3',
  ]) {
    it(`keeps sign-in available across restarts and removes it after recovery (${endpoint})`, async () => {
      const data = new InMemoryStore()
      const secure = new AsyncInMemoryStore()
      const store = new AccountsStore(data, secure)
      const account = new Account(
        'octocat',
        endpoint,
        'token',
        [],
        '',
        1,
        'Octocat'
      )
      await store.addAccount(account)
      let prompts = 0
      store.onRequiresSignIn(() => prompts++)
      await store.invalidateToken(endpoint, account.token)
      await assert.rejects(store.getAccountWithFreshToken(account))
      assert.equal(prompts, 1)

      const restarted = new AccountsStore(data, secure)
      const actions: string[] = []
      const props = {
        onDotComSignIn: () => actions.push('dotcom'),
        onEnterpriseSignIn: (url?: string) =>
          actions.push(url ?? 'new-enterprise'),
        onLogout: () => actions.push('logout'),
      }
      const view = render(
        <Accounts {...props} accounts={await restarted.getAll()} />
      )
      const button = screen.getByRole('button', { name: signInAgain })
      if (endpoint === 'https://api.github.com') {
        assert.ok(button.classList.contains(DialogPreferredFocusClassName))
        assert.equal(
          screen
            .getByRole('button', { name: signOut })
            .classList.contains(DialogPreferredFocusClassName),
          false
        )
      }
      fireEvent.click(button)
      assert.deepEqual(actions, [
        endpoint === 'https://api.github.com'
          ? 'dotcom'
          : 'https://github.example.com',
      ])
      assert.equal((await restarted.getAll()).length, 1)
      fireEvent.click(screen.getByRole('button', { name: signOut }))
      assert.equal(actions[1], 'logout')

      await restarted.addAccount(account.withToken('replacement'))
      view.rerender(<Accounts {...props} accounts={await restarted.getAll()} />)
      assert.equal(screen.queryByRole('button', { name: signInAgain }), null)
      assert.ok(screen.getByRole('button', { name: signOut }))
      if (endpoint === 'https://api.github.com') {
        assert.ok(
          screen
            .getByRole('button', { name: signOut })
            .classList.contains(DialogPreferredFocusClassName)
        )
      }
    })
  }

  it('targets the selected Enterprise account and keeps adding accounts separate', () => {
    const endpoints = [
      'https://first.example.com/api/v3',
      'https://second.example.com/api/v3',
    ]
    const urls: Array<string | undefined> = []
    render(
      <Accounts
        accounts={endpoints.map(
          endpoint => new Account('octocat', endpoint, '', [], '', 1, 'Octocat')
        )}
        onDotComSignIn={() => assert.fail('Unexpected GitHub.com sign-in')}
        onEnterpriseSignIn={url => urls.push(url)}
        onLogout={() => assert.fail('Unexpected sign-out')}
      />
    )
    for (const button of screen.getAllByRole('button', { name: signInAgain })) {
      fireEvent.click(button)
    }
    fireEvent.click(
      screen.getByRole('button', { name: 'Add GitHub Enterprise account' })
    )
    assert.deepEqual(urls, [
      'https://first.example.com',
      'https://second.example.com',
      undefined,
    ])
  })

  it('preserves sign-in actions when no accounts are present', () => {
    const actions: string[] = []
    render(
      <Accounts
        accounts={[]}
        onDotComSignIn={() => actions.push('dotcom')}
        onEnterpriseSignIn={url => {
          assert.equal(url, undefined)
          actions.push('enterprise')
        }}
        onLogout={() => assert.fail('Unexpected sign-out')}
      />
    )
    fireEvent.click(
      screen.getByRole('button', { name: /sign into GitHub.com/i })
    )
    fireEvent.click(
      screen.getByRole('button', { name: /sign into GitHub Enterprise/i })
    )
    assert.deepEqual(actions, ['dotcom', 'enterprise'])
    assert.equal(screen.queryByRole('button', { name: signInAgain }), null)
  })
})
