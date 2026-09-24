import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import * as React from 'react'
import { Account } from '../../../src/models/account'
import { Accounts } from '../../../src/ui/preferences/accounts'
import { AccountsStore } from '../../../src/lib/stores/accounts-store'
import { DialogPreferredFocusClassName } from '../../../src/ui/dialog'
import { InMemoryStore, AsyncInMemoryStore } from '../../helpers/stores'
import { render, screen, fireEvent } from '../../helpers/ui/render'

describe('Account settings after invalidation', () => {
  for (const endpoint of [
    'https://api.github.com',
    'https://github.example.com/api/v3',
  ]) {
    it(`shows the normal sign-in choice after sign-out and restart (${endpoint})`, async () => {
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
      assert.equal(prompts, 1)
      assert.deepEqual(await store.getAll(), [])

      const restarted = new AccountsStore(data, secure)
      const actions: string[] = []
      render(
        <Accounts
          accounts={await restarted.getAll()}
          onDotComSignIn={() => actions.push('dotcom')}
          onEnterpriseSignIn={url => actions.push(url ?? 'new-enterprise')}
          onLogout={() => assert.fail('Account should be signed out')}
        />
      )
      assert.equal(screen.queryByText('Octocat'), null)
      const button =
        endpoint === 'https://api.github.com'
          ? screen.getByRole('button', { name: /sign into GitHub.com/i })
          : screen.getByRole('button', { name: /sign into GitHub Enterprise/i })
      fireEvent.click(button)
      assert.deepEqual(actions, [
        endpoint === 'https://api.github.com' ? 'dotcom' : 'new-enterprise',
      ])
      assert.deepEqual(await restarted.getAll(), [])
    })
  }

  it('keeps sign-out focused for an active GitHub.com account', () => {
    render(
      <Accounts
        accounts={[
          new Account(
            'octocat',
            'https://api.github.com',
            'token',
            [],
            '',
            1,
            'Octocat'
          ),
        ]}
        onDotComSignIn={() => assert.fail('Unexpected sign-in')}
        onEnterpriseSignIn={() => assert.fail('Unexpected Enterprise sign-in')}
        onLogout={() => {}}
      />
    )
    assert.ok(
      screen
        .getByRole('button', { name: /sign out/i })
        .classList.contains(DialogPreferredFocusClassName)
    )
  })
})
