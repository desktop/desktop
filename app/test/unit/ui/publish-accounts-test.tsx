import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'
import { API } from '../../../src/lib/api'
import { Account } from '../../../src/models/account'
import { Repository } from '../../../src/models/repository'
import { Publish } from '../../../src/ui/publish-repository/publish'
import { PublishRepository } from '../../../src/ui/publish-repository/publish-repository'
import { PublishSettingsType } from '../../../src/models/publish-settings'
import type { Dispatcher } from '../../../src/ui/dispatcher'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

const alice = new Account(
  'alice',
  'https://api.github.com',
  'token',
  [],
  '',
  1,
  'Alice'
)
const bob = new Account(
  'bob',
  'https://api.github.com',
  'token',
  [],
  '',
  2,
  'Bob'
)

describe('Publish account selection', () => {
  it('selects the sole signed-in account for an unassociated repository', async t => {
    const electron = await import('electron')
    const originalSend = electron.ipcRenderer.send
    electron.ipcRenderer.send = () => {}
    t.after(() => {
      electron.ipcRenderer.send = originalSend
    })
    t.mock.method(API.prototype, 'fetchOrgs', async () => [])
    render(
      <Publish
        dispatcher={{} as Dispatcher}
        repository={new Repository('/nonexistent/repo', 1, null, false)}
        accounts={[alice]}
        onDismissed={t.mock.fn()}
      />
    )
    assert.ok(screen.getByText('@alice'))
    assert.ok(
      screen.getByRole('button', { name: /Publish repository/i, hidden: true })
    )
  })

  it('returns to Publish and selects the contextual sign-in account', async t => {
    const electron = await import('electron')
    const originalSend = electron.ipcRenderer.send
    electron.ipcRenderer.send = () => {}
    t.after(() => {
      electron.ipcRenderer.send = originalSend
    })
    t.mock.method(API.prototype, 'fetchOrgs', async () => [])
    let onSignedIn:
      | ((result: { kind: 'success'; account: Account }) => void)
      | undefined
    const dispatcher = {
      showDotComSignInDialog: (
        callback: (result: { kind: 'success'; account: Account }) => void
      ) => {
        onSignedIn = callback
      },
    } as unknown as Dispatcher
    const view = render(
      <Publish
        dispatcher={dispatcher}
        repository={new Repository('/nonexistent/repo', 1, null, false)}
        accounts={[]}
        onDismissed={t.mock.fn()}
      />
    )
    fireEvent.click(
      screen.getByRole('button', { name: /^Sign In$/i, hidden: true })
    )
    assert.ok(onSignedIn)
    onSignedIn({ kind: 'success', account: alice })
    view.rerender(
      <Publish
        dispatcher={dispatcher}
        repository={new Repository('/nonexistent/repo', 1, null, false)}
        accounts={[alice]}
        onDismissed={t.mock.fn()}
      />
    )
    assert.ok(screen.getByText('@alice'))
  })

  it('requires a choice for an unassociated repository and uses the chosen account', async t => {
    const electron = await import('electron')
    const originalSend = electron.ipcRenderer.send
    electron.ipcRenderer.send = () => {}
    t.after(() => {
      electron.ipcRenderer.send = originalSend
    })
    t.mock.method(API.prototype, 'fetchOrgs', async () => [])
    const repository = new Repository('/nonexistent/repo', 1, null, false)
    const publish = t.mock.fn<Dispatcher['publishRepository']>(
      async () => repository
    )
    const dispatcher = { publishRepository: publish } as unknown as Dispatcher

    const view = render(
      <Publish
        dispatcher={dispatcher}
        repository={repository}
        accounts={[alice, bob]}
        onDismissed={t.mock.fn()}
      />
    )

    assert.equal(view.container.querySelectorAll('[role="tab"]').length, 0)
    assert.ok(screen.getByRole('combobox', { name: 'Account', hidden: true }))
    assert.equal(
      screen.queryByRole('button', {
        name: /Publish repository/i,
        hidden: true,
      }),
      null
    )
    fireEvent.change(
      screen.getByRole('combobox', { name: 'Account', hidden: true }),
      {
        target: { value: '1' },
      }
    )
    assert.ok(screen.getByText('@bob'))
    const form = view.container.querySelector('form')
    assert.ok(form)
    fireEvent.submit(form)
    await waitFor(() => assert.equal(publish.mock.callCount(), 1))
    assert.strictEqual(publish.mock.calls[0].arguments[4], bob)
  })

  it('defaults to the associated account rather than the first account', async t => {
    const electron = await import('electron')
    const originalSend = electron.ipcRenderer.send
    electron.ipcRenderer.send = () => {}
    t.after(() => {
      electron.ipcRenderer.send = originalSend
    })
    t.mock.method(API.prototype, 'fetchOrgs', async () => [])
    const repository = new Repository(
      '/nonexistent/repo',
      1,
      null,
      false,
      null,
      undefined,
      false,
      undefined,
      undefined,
      { endpoint: bob.endpoint, id: bob.id }
    )
    render(
      <Publish
        dispatcher={{} as Dispatcher}
        repository={repository}
        accounts={[alice, bob]}
        onDismissed={t.mock.fn()}
      />
    )
    assert.ok(screen.getByText('@bob'))
  })

  it('refreshes organizations for the newly selected account', async t => {
    t.mock.method(API, 'fromAccount', (account: Account) => {
      const api = new API(account.endpoint, account.token)
      t.mock.method(api, 'fetchOrgs', async () => [
        {
          id: account.id,
          login: account.id === alice.id ? 'alice-org' : 'bob-org',
          url: '',
          avatar_url: '',
        },
      ])
      return api
    })
    const settings = {
      kind: PublishSettingsType.dotcom,
      name: 'repo',
      description: '',
      private: true,
      org: null,
    }
    const view = render(
      <PublishRepository
        account={alice}
        accounts={[alice, bob]}
        settings={settings}
        onSettingsChanged={t.mock.fn()}
        onSelectedAccountChanged={t.mock.fn()}
      />
    )
    await waitFor(() =>
      assert.ok(screen.getByRole('option', { name: 'alice-org' }))
    )
    view.rerender(
      <PublishRepository
        account={bob}
        accounts={[alice, bob]}
        settings={settings}
        onSettingsChanged={t.mock.fn()}
        onSelectedAccountChanged={t.mock.fn()}
      />
    )
    await waitFor(() =>
      assert.ok(screen.getByRole('option', { name: 'bob-org' }))
    )
    assert.equal(screen.queryByRole('option', { name: 'alice-org' }), null)
  })
})
