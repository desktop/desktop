import assert from 'node:assert'
import { describe, it, TestContext } from 'node:test'
import * as React from 'react'

import { API, IAPIOrganization } from '../../../src/lib/api'
import { SignInResult } from '../../../src/lib/stores/sign-in-store'
import { Account } from '../../../src/models/account'
import { Repository } from '../../../src/models/repository'
import type { Dispatcher } from '../../../src/ui/dispatcher'
import { Publish } from '../../../src/ui/publish-repository/publish'
import { createMockAPI } from '../../helpers/mock-api'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

const endpoint = 'https://api.github.com'
const zebraEndpoint = 'https://zebra.example.com/api/v3'
const acmeEndpoint = 'https://acme.example.com/api/v3'
const alice = new Account('alice', endpoint, 'alice-token', [], '', 1, '')
const bob = new Account('bob', endpoint, 'bob-token', [], '', 2, '')
const zebraCarol = new Account('carol', zebraEndpoint, 'z-token', [], '', 3, '')
const acmeDave = new Account('dave', acmeEndpoint, 'a-token', [], '', 4, '')
const gheErin = new Account(
  'erin',
  'https://api.octo.ghe.com',
  'g-token',
  [],
  '',
  5,
  ''
)

const org = (id: number, login: string): IAPIOrganization => ({
  id,
  login,
  url: `https://api.github.com/orgs/${login}`,
  avatar_url: '',
})

/** Reports a fixed size so the virtualized account list renders its rows. */
class SizedResizeObserver implements ResizeObserver {
  public constructor(private readonly callback: ResizeObserverCallback) {}

  public observe(target: Element) {
    Object.defineProperty(target, 'offsetWidth', { value: 300 })
    Object.defineProperty(target, 'offsetHeight', { value: 300 })
    const contentRect = new DOMRectReadOnly(0, 0, 300, 300)
    this.callback(
      [
        {
          target,
          contentRect,
          borderBoxSize: [],
          contentBoxSize: [],
          devicePixelContentBoxSize: [],
        },
      ],
      this
    )
  }

  public unobserve() {}

  public disconnect() {}
}

async function setup(
  t: TestContext,
  orgsByLogin: Record<string, ReadonlyArray<IAPIOrganization>> = {}
) {
  const originalResizeObserver = window.ResizeObserver
  Object.assign(window, { ResizeObserver: SizedResizeObserver })
  t.after(() => {
    Object.assign(window, { ResizeObserver: originalResizeObserver })
  })

  const electron = await import('electron')
  const originalSend = electron.ipcRenderer.send
  electron.ipcRenderer.send = () => {}
  t.after(() => {
    electron.ipcRenderer.send = originalSend
  })

  return t.mock.method(API, 'fromAccount', (account: Account) =>
    createMockAPI({
      fetchOrgs: async () => [...(orgsByLogin[account.login] ?? [])],
    })
  )
}

const unassociated = () => new Repository('/does-not-exist', 1, null, false)

function selectedLogin(container: HTMLElement) {
  return container.querySelector('.account-picker .login')?.textContent
}

function publishButton() {
  return screen.getByRole('button', {
    name: /publish repository/i,
    hidden: true,
  })
}

function openAccountPicker() {
  fireEvent.click(screen.getByRole('button', { name: 'Account', hidden: true }))
}

async function selectAccount(container: HTMLElement, account: Account) {
  openAccountPicker()
  const item = await waitFor(() =>
    screen.getByRole('option', {
      name: new RegExp(`@${account.login} `),
      hidden: true,
    })
  )
  fireEvent.click(item)
  await waitFor(() =>
    assert.strictEqual(selectedLogin(container), `@${account.login}`)
  )
}

function renderPublish(
  t: TestContext,
  accounts: ReadonlyArray<Account>,
  dispatcher: Partial<Dispatcher> = {},
  repository = unassociated()
) {
  const element = (accounts: ReadonlyArray<Account>) => (
    <Publish
      dispatcher={dispatcher as Dispatcher}
      repository={repository}
      accounts={accounts}
      onDismissed={t.mock.fn()}
    />
  )
  const view = render(element(accounts))
  return {
    ...view,
    setAccounts: (accounts: ReadonlyArray<Account>) =>
      view.rerender(element(accounts)),
  }
}

describe('Publish repository', () => {
  it('shows a single account picker grouped by host instead of tabs', async t => {
    await setup(t)
    const view = renderPublish(t, [zebraCarol, alice, gheErin, acmeDave, bob])

    assert.strictEqual(view.container.querySelector('.tab-bar'), null)
    assert.strictEqual(
      view.container.querySelectorAll('.account-picker').length,
      1
    )
    assert.strictEqual(
      screen.queryByRole('button', {
        name: /sign in to another account/i,
        hidden: true,
      }),
      null
    )

    openAccountPicker()
    await waitFor(() =>
      assert.deepStrictEqual(
        [...document.querySelectorAll('.filter-list-group-header')].map(
          h => h.textContent
        ),
        ['GitHub.com', 'acme.example.com', 'octo.ghe.com', 'zebra.example.com']
      )
    )
  })

  it('selects the only signed-in account', async t => {
    await setup(t)
    const view = renderPublish(t, [acmeDave])

    assert.strictEqual(selectedLogin(view.container), '@dave')
    assert.strictEqual(publishButton().getAttribute('aria-disabled'), null)
  })

  it('requires a choice when several accounts are signed in', async t => {
    const fromAccount = await setup(t)
    const publishRepository = t.mock.fn<Dispatcher['publishRepository']>(
      async repository => repository
    )
    const view = renderPublish(t, [alice, zebraCarol], { publishRepository })

    assert.strictEqual(selectedLogin(view.container), undefined)
    assert.match(
      view.container.querySelector('.account-picker .placeholder')
        ?.textContent ?? '',
      /choose an account/i
    )
    assert.strictEqual(publishButton().getAttribute('aria-disabled'), 'true')
    assert.strictEqual(fromAccount.mock.callCount(), 0)

    const form = view.container.querySelector('form')
    assert.ok(form)
    fireEvent.submit(form)
    await new Promise(resolve => setTimeout(resolve, 0))
    assert.strictEqual(publishRepository.mock.callCount(), 0)

    await selectAccount(view.container, zebraCarol)
    assert.strictEqual(publishButton().getAttribute('aria-disabled'), null)
    fireEvent.submit(form)
    await waitFor(() =>
      assert.strictEqual(publishRepository.mock.callCount(), 1)
    )
    assert.strictEqual(publishRepository.mock.calls[0].arguments[4], zebraCarol)
  })

  it('refreshes organizations and clears the chosen one when the account changes', async t => {
    const fromAccount = await setup(t, {
      alice: [org(1, 'alice-org')],
      bob: [org(2, 'bob-org')],
    })
    const publishRepository = t.mock.fn<Dispatcher['publishRepository']>(
      async repository => repository
    )
    const view = renderPublish(t, [alice, bob], { publishRepository })

    await selectAccount(view.container, alice)
    const orgSelect = await waitFor(() =>
      screen.getByRole<HTMLSelectElement>('combobox', {
        name: 'Organization',
        hidden: true,
      })
    )
    fireEvent.change(orgSelect, { target: { value: '0' } })
    await waitFor(() => assert.strictEqual(orgSelect.value, '0'))

    await selectAccount(view.container, bob)
    await waitFor(() =>
      screen.getByRole('option', { name: 'bob-org', hidden: true })
    )
    assert.strictEqual(
      screen.queryByRole('option', { name: 'alice-org', hidden: true }),
      null
    )
    assert.deepStrictEqual(
      fromAccount.mock.calls.map(c => c.arguments[0].login),
      ['alice', 'bob']
    )

    const form = view.container.querySelector('form')
    assert.ok(form)
    fireEvent.submit(form)
    await waitFor(() =>
      assert.strictEqual(publishRepository.mock.callCount(), 1)
    )
    assert.strictEqual(publishRepository.mock.calls[0].arguments[4], bob)
    assert.strictEqual(publishRepository.mock.calls[0].arguments[5], null)
  })

  it('shows the sign-in prompt and selects the account signed in to', async t => {
    await setup(t)
    let onSignIn: ((result: SignInResult) => void) | undefined
    const showDotComSignInDialog = t.mock.fn<
      Dispatcher['showDotComSignInDialog']
    >(async callback => {
      onSignIn = callback
    })
    const showEnterpriseSignInDialog =
      t.mock.fn<Dispatcher['showEnterpriseSignInDialog']>()
    const view = renderPublish(t, [], {
      showDotComSignInDialog,
      showEnterpriseSignInDialog,
    })

    assert.strictEqual(view.container.querySelector('.account-picker'), null)
    assert.strictEqual(
      screen.queryByRole('button', {
        name: /publish repository/i,
        hidden: true,
      }),
      null
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: /sign in to github enterprise/i,
        hidden: true,
      })
    )
    assert.strictEqual(showEnterpriseSignInDialog.mock.callCount(), 1)
    assert.strictEqual(
      typeof showEnterpriseSignInDialog.mock.calls[0].arguments[1],
      'function'
    )

    fireEvent.click(
      screen.getByRole('button', { name: /^sign in$/i, hidden: true })
    )
    assert.strictEqual(showDotComSignInDialog.mock.callCount(), 1)
    assert.ok(onSignIn)

    // Another account was already signed in elsewhere while signing in, so
    // the new account must be selected explicitly rather than being the
    // sole account.
    view.setAccounts([alice, bob])
    onSignIn({ kind: 'success', account: bob })

    await waitFor(() =>
      assert.strictEqual(selectedLogin(view.container), '@bob')
    )
    assert.strictEqual(publishButton().getAttribute('aria-disabled'), null)
  })
})
