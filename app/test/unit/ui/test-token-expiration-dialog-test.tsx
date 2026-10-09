import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as React from 'react'
import { Account } from '../../../src/models/account'
import { IAccountTokenExpiration } from '../../../src/lib/credential-sessions'
import { Dispatcher } from '../../../src/ui/dispatcher'
import { TestTokenExpirationDialog } from '../../../src/ui/preferences/test-token-expiration-dialog'
import { render, screen, fireEvent, waitFor } from '../../helpers/ui/render'

const now = 1_800_000_000_000
const account = new Account(
  'octocat',
  'https://api.github.com',
  'private-access-token',
  [],
  '',
  1,
  'Octocat'
)
const initial: IAccountTokenExpiration = {
  isRefreshable: true,
  expiresAt: now + 8 * 60 * 60_000,
  originalExpiresAt: now + 8 * 60 * 60_000,
  isOverridden: false,
}
type TestDispatcher = Pick<
  Dispatcher,
  'getAccountTokenExpirationForTesting' | 'setAccountTokenExpirationForTesting'
>

function createDispatcher(expiration = initial) {
  const writes: Array<{ account: Account; expiresAt: number | undefined }> = []
  const dispatcher: TestDispatcher = {
    getAccountTokenExpirationForTesting: async () => expiration,
    setAccountTokenExpirationForTesting: async (account, expiresAt) => {
      writes.push({ account, expiresAt })
      expiration = {
        ...expiration,
        expiresAt: expiresAt ?? expiration.originalExpiresAt,
        isOverridden: expiresAt !== undefined,
      }
      return expiration
    },
  }
  return { dispatcher, writes }
}

function renderDialog(
  dispatcher: TestDispatcher,
  accounts: ReadonlyArray<Account> = [account]
) {
  return render(
    <TestTokenExpirationDialog
      accounts={accounts}
      dispatcher={dispatcher}
      onDismissed={() => {}}
    />
  )
}

function dateInput() {
  const input = screen.getByLabelText('Expiration (local time)')
  assert.ok(input instanceof HTMLInputElement)
  return input
}

function button(name: string) {
  const value = screen.getByRole('button', { name, hidden: true })
  assert.ok(value instanceof HTMLButtonElement)
  return value
}

function applyExpiry() {
  // Bypass JSDOM's datetime step validation, which cannot load decimal.js
  // under the test runner's import condition.
  const form = button('Apply expiry').form
  assert.ok(form)
  fireEvent.submit(form)
}

describe('TestTokenExpirationDialog', () => {
  let restoreIpcSend: () => void
  beforeEach(async () => {
    const electron = await import('electron')
    const previousSend = electron.ipcRenderer.send
    electron.ipcRenderer.send = () => {}
    restoreIpcSend = () => {
      electron.ipcRenderer.send = previousSend
    }
  })
  afterEach(() => restoreIpcSend())

  it('loads expiry without displaying credentials', async () => {
    const { dispatcher, writes } = createDispatcher()
    const view = renderDialog(dispatcher)
    await waitFor(() => assert.equal(dateInput().disabled, false))
    assert.equal(new Date(dateInput().value).getTime(), initial.expiresAt)
    assert.equal(view.container.textContent?.includes(account.token), false)
    assert.equal(button('Reset override').getAttribute('aria-disabled'), 'true')
    assert.deepEqual(writes, [])
  })

  it('presets update the editable local date and time without applying an override', async t => {
    t.mock.method(Date, 'now', () => now)
    const { dispatcher, writes } = createDispatcher()
    renderDialog(dispatcher)
    await waitFor(() => assert.equal(dateInput().disabled, false))
    const presets: ReadonlyArray<readonly [string, number]> = [
      ['Expired', -1],
      ['In 10 min', 10],
      ['In 1h', 60],
      ['In 62 min', 62],
      ['In 8h', 480],
    ]
    for (const [label, minutes] of presets) {
      fireEvent.click(button(label))
      assert.equal(
        new Date(dateInput().value).getTime(),
        now + minutes * 60_000
      )
    }
    fireEvent.change(dateInput(), { target: { value: '2030-06-15T12:30:45' } })
    assert.equal(
      new Date(dateInput().value).getTime(),
      new Date('2030-06-15T12:30:45').getTime()
    )
    assert.deepEqual(writes, [])
  })

  it('applies a manually adjusted local expiration and keeps the dialog open', async () => {
    const { dispatcher, writes } = createDispatcher()
    renderDialog(dispatcher)
    await waitFor(() => assert.equal(dateInput().disabled, false))
    const chosen = '2030-06-15T12:30:45'
    fireEvent.change(dateInput(), { target: { value: chosen } })
    applyExpiry()
    await screen.findByText('Expiration override applied.')
    assert.deepEqual(writes, [
      { account, expiresAt: new Date(chosen).getTime() },
    ])
    assert.notEqual(
      button('Reset override').getAttribute('aria-disabled'),
      'true'
    )
    assert.ok(screen.getByText(/Original expiry:/))
  })

  it('disables applying empty dates but permits an expired preset', async t => {
    t.mock.method(Date, 'now', () => now)
    const { dispatcher, writes } = createDispatcher()
    renderDialog(dispatcher)
    await waitFor(() => assert.equal(dateInput().disabled, false))
    fireEvent.change(dateInput(), { target: { value: '' } })
    assert.equal(button('Apply expiry').getAttribute('aria-disabled'), 'true')
    fireEvent.click(button('Expired'))
    assert.notEqual(
      button('Apply expiry').getAttribute('aria-disabled'),
      'true'
    )
    applyExpiry()
    await screen.findByText('Expiration override applied.')
    assert.equal(writes[0].expiresAt, now - 60_000)
  })

  it('resets an override to the original expiry', async () => {
    const { dispatcher, writes } = createDispatcher({
      ...initial,
      expiresAt: now,
      isOverridden: true,
    })
    renderDialog(dispatcher)
    await waitFor(() =>
      assert.notEqual(
        button('Reset override').getAttribute('aria-disabled'),
        'true'
      )
    )
    fireEvent.click(button('Reset override'))
    await screen.findByText('Original expiration restored.')
    assert.deepEqual(writes, [{ account, expiresAt: undefined }])
    assert.equal(
      new Date(dateInput().value).getTime(),
      initial.originalExpiresAt
    )
    assert.equal(button('Reset override').getAttribute('aria-disabled'), 'true')
  })

  it('disables controls for non-refreshable accounts', async () => {
    const { dispatcher } = createDispatcher({
      ...initial,
      isRefreshable: false,
      expiresAt: undefined,
    })
    renderDialog(dispatcher)
    await screen.findByText(/This account does not have a refreshable token/)
    assert.equal(dateInput().disabled, true)
    assert.equal(button('In 10 min').getAttribute('aria-disabled'), 'true')
    assert.equal(button('Apply expiry').getAttribute('aria-disabled'), 'true')
  })

  it('explains when no account is signed in', () => {
    renderDialog(createDispatcher().dispatcher, [])
    assert.ok(
      screen.getByText(/Sign in to an account with a refreshable token/)
    )
    assert.equal(button('Apply expiry').getAttribute('aria-disabled'), 'true')
    assert.equal(screen.queryByLabelText('Account'), null)
  })

  it('loads an account that signs in while the empty dialog is open', async () => {
    const { dispatcher } = createDispatcher()
    const view = renderDialog(dispatcher, [])
    view.rerender(
      <TestTokenExpirationDialog
        accounts={[account]}
        dispatcher={dispatcher}
        onDismissed={() => {}}
      />
    )
    await waitFor(() => assert.equal(dateInput().disabled, false))
    assert.equal(new Date(dateInput().value).getTime(), initial.expiresAt)
  })

  it('discards stale metadata returned after a sign-in replacement', async t => {
    const { dispatcher } = createDispatcher()
    let finish: (expiration: IAccountTokenExpiration) => void = () => {
      throw new Error('Metadata request has not started.')
    }
    const pending = new Promise<IAccountTokenExpiration>(resolve => {
      finish = resolve
    })
    t.mock.method(
      dispatcher,
      'getAccountTokenExpirationForTesting',
      async (selected: Account) => (selected === account ? pending : initial)
    )
    const view = renderDialog(dispatcher)
    view.rerender(
      <TestTokenExpirationDialog
        accounts={[account.withToken('replacement')]}
        dispatcher={dispatcher}
        onDismissed={() => {}}
      />
    )
    await waitFor(() => assert.equal(dateInput().disabled, false))
    finish({ ...initial, expiresAt: now })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(new Date(dateInput().value).getTime(), initial.expiresAt)
  })

  it('switches accounts without applying an override', async t => {
    const { dispatcher, writes } = createDispatcher()
    const enterprise = new Account(
      'mona',
      'https://enterprise.example.com/api/v3',
      'other-token',
      [],
      '',
      2,
      'Mona'
    )
    const reads = t.mock.method(
      dispatcher,
      'getAccountTokenExpirationForTesting',
      async (selected: Account) => ({
        ...initial,
        expiresAt: selected === account ? now : initial.expiresAt,
      })
    )
    renderDialog(dispatcher, [account, enterprise])
    await waitFor(() => assert.equal(dateInput().disabled, false))
    fireEvent.change(screen.getByLabelText('Account'), {
      target: { value: enterprise.endpoint },
    })
    await waitFor(() =>
      assert.equal(new Date(dateInput().value).getTime(), initial.expiresAt)
    )
    assert.equal(reads.mock.calls[1].arguments[0], enterprise)
    assert.deepEqual(writes, [])
  })

  it('refreshes displayed metadata when an account token rotates', async t => {
    const { dispatcher } = createDispatcher({
      ...initial,
      expiresAt: now,
      isOverridden: true,
    })
    const view = renderDialog(dispatcher)
    await waitFor(() =>
      assert.notEqual(
        button('Reset override').getAttribute('aria-disabled'),
        'true'
      )
    )
    t.mock.method(
      dispatcher,
      'getAccountTokenExpirationForTesting',
      async () => initial
    )
    view.rerender(
      <TestTokenExpirationDialog
        accounts={[account.withToken('rotated-token')]}
        dispatcher={dispatcher}
        onDismissed={() => {}}
      />
    )
    await waitFor(() =>
      assert.equal(new Date(dateInput().value).getTime(), initial.expiresAt)
    )
    assert.equal(button('Reset override').getAttribute('aria-disabled'), 'true')
  })

  it('shows metadata load errors', async t => {
    const { dispatcher } = createDispatcher()
    t.mock.method(
      dispatcher,
      'getAccountTokenExpirationForTesting',
      async () => {
        throw new Error('Test controls unavailable')
      }
    )
    renderDialog(dispatcher)
    assert.equal(
      (await screen.findByRole('alert', { hidden: true })).textContent,
      'Test controls unavailable'
    )
    assert.equal(button('Apply expiry').getAttribute('aria-disabled'), 'true')
  })

  it('shows apply errors and allows retrying without dismissing', async t => {
    const { dispatcher } = createDispatcher()
    t.mock.method(
      dispatcher,
      'setAccountTokenExpirationForTesting',
      async () => {
        throw new Error('Token renewal is in progress.')
      }
    )
    renderDialog(dispatcher)
    await waitFor(() => assert.equal(dateInput().disabled, false))
    applyExpiry()
    assert.equal(
      (await screen.findByRole('alert', { hidden: true })).textContent,
      'Token renewal is in progress.'
    )
    assert.notEqual(
      button('Apply expiry').getAttribute('aria-disabled'),
      'true'
    )
  })
})
