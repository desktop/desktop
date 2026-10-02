import * as React from 'react'
import assert from 'node:assert'
import { describe, it } from 'node:test'
import { render, screen, fireEvent, waitFor } from '../../helpers/ui/render'
import { SelectRepositoryAccount } from '../../../src/ui/select-repository-account'
import { Account } from '../../../src/models/account'
import { Repository } from '../../../src/models/repository'
import { stubIPCSend } from '../../helpers/ui/electron'

describe('select repository account', () => {
  it('requires a choice and submits only the selected identity', async t => {
    t.after(stubIPCSend())
    const accounts = [
      new Account('work', 'https://api.github.com', 'token', [], '', 1, 'Work'),
      new Account(
        'personal',
        'https://api.github.com',
        'token',
        [],
        '',
        2,
        'Personal'
      ),
    ]
    const selected: number[] = []
    const view = render(
      <SelectRepositoryAccount
        repository={new Repository('/repo', 1, null, false)}
        accounts={accounts}
        onAssign={async (_repository, account) => {
          selected.push(account.id)
        }}
        onSelected={() => {}}
        onDismissed={() => {}}
      />
    )

    const button = screen.getByText('Use account')
    assert.strictEqual(button.getAttribute('aria-disabled'), 'true')
    const select = view.container.querySelector('select')
    assert.ok(select)
    fireEvent.change(select, { target: { value: '2' } })
    fireEvent.click(button)
    await waitFor(() => assert.deepStrictEqual(selected, [2]))
  })
})
