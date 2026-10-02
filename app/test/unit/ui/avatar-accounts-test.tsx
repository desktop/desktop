import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'
import { render, waitFor } from '../../helpers/ui/render'
import { API } from '../../../src/lib/api'
import { Account } from '../../../src/models/account'
import { Avatar } from '../../../src/ui/lib/avatar'

const endpoint = 'https://example.ghe.com/api/v3'
const user = {
  email: 'dev@example.com',
  endpoint,
  name: 'Dev',
  avatarURL: undefined,
}
const account = (id: number) =>
  new Account(`dev${id}`, endpoint, `token${id}`, [], '', id, `Dev ${id}`)

describe('Avatar with same-host accounts', () => {
  it('only uses an avatar token while the account is unambiguous', async t => {
    const setTimeout = window.setTimeout.bind(window)
    t.mock.method(
      window,
      'setTimeout',
      (handler: TimerHandler, timeout?: number) =>
        timeout === 3_000_000 ? 0 : setTimeout(handler, timeout)
    )
    let calls = 0
    t.mock.method(API.prototype, 'getAvatarToken', async () => {
      calls++
      return 'avatar-token'
    })
    const first = account(1)
    const second = account(2)
    const view = render(
      <Avatar user={user} accounts={[first, second]} tooltip={false} />
    )

    assert.strictEqual(view.container.querySelector('img'), null)
    assert.strictEqual(calls, 0)

    view.rerender(<Avatar user={user} accounts={[first]} tooltip={false} />)
    await waitFor(() =>
      assert.ok(
        view.container.querySelector('img')?.src.includes('avatar-token')
      )
    )
    assert.strictEqual(calls, 1)

    view.rerender(
      <Avatar user={user} accounts={[first, second]} tooltip={false} />
    )
    await waitFor(() =>
      assert.strictEqual(view.container.querySelector('img'), null)
    )
  })
})
