import assert from 'node:assert'
import {
  after,
  afterEach,
  before,
  beforeEach,
  describe,
  it,
  mock,
} from 'node:test'
import * as React from 'react'
import { Account } from '../../../src/models/account'
import { GitHubRepository } from '../../../src/models/github-repository'
import { Owner } from '../../../src/models/owner'
import { PopupType } from '../../../src/models/popup'
import {
  Repository,
  assertIsRepositoryWithGitHubRepository,
} from '../../../src/models/repository'
import { SignInResult } from '../../../src/lib/stores/sign-in-store'
import type { Dispatcher } from '../../../src/ui/dispatcher'
import { act } from 'react-dom/test-utils'
import { fireEvent, render, screen } from '../../helpers/ui/render'
import {
  advanceTimersBy,
  enableTestTimers,
  resetTestTimers,
} from '../../helpers/ui/timers'

const endpoint = 'https://api.github.com'
const enterpriseEndpoint = 'https://enterprise.example.com/api/v3'
const personal = new Account('personal', endpoint, 'token', [], '', 1, '')
const work = new Account('work', endpoint, 'token', [], '', 2, '')
const enterprise = new Account(
  'work',
  enterpriseEndpoint,
  'token',
  [],
  '',
  3,
  ''
)

const showModalDescriptor = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  'showModal'
)
const closeDescriptor = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  'close'
)

beforeEach(() => {
  enableTestTimers(['setTimeout'])
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function () {
    this.open = false
  }
})
afterEach(() => {
  resetTestTimers()
  if (showModalDescriptor === undefined) {
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
  } else {
    Object.defineProperty(
      HTMLDialogElement.prototype,
      'showModal',
      showModalDescriptor
    )
  }
  if (closeDescriptor === undefined) {
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
  } else {
    Object.defineProperty(HTMLDialogElement.prototype, 'close', closeDescriptor)
  }
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

const originalResizeObserver = window.ResizeObserver
let originalSend: ((channel: string, ...args: any[]) => void) | undefined

before(async () => {
  Object.assign(window, { ResizeObserver: SizedResizeObserver })
  const electron = await import('electron')
  originalSend = electron.ipcRenderer.send
  electron.ipcRenderer.send = () => {}
})

after(async () => {
  Object.assign(window, { ResizeObserver: originalResizeObserver })
  if (originalSend !== undefined) {
    const electron = await import('electron')
    electron.ipcRenderer.send = originalSend
  }
})

function createRepository(login: string | null = null, host = endpoint) {
  const repository = new Repository(
    '/repository',
    1,
    new GitHubRepository('repository', new Owner('owner', host, 1), 1),
    false,
    null,
    {},
    false,
    undefined,
    undefined,
    login
  )
  assertIsRepositoryWithGitHubRepository(repository)
  return repository
}

async function renderDialog(element: React.ReactElement) {
  const { DialogStackContext } = await import('../../../src/ui/dialog/dialog')
  const view = render(element, {
    wrapper: ({ children }) => (
      <DialogStackContext.Provider value={{ isTopMost: true }}>
        {children}
      </DialogStackContext.Provider>
    ),
  })
  advanceTimersBy(300)
  return view
}

async function renderAccountDialog(
  repository = createRepository(),
  accounts: ReadonlyArray<Account> = [personal, work, enterprise]
) {
  const { RepositoryAccountDialog } = await import(
    '../../../src/ui/repository-account/repository-account-dialog'
  )
  let callback: ((result: SignInResult) => void) | undefined
  const completed: Array<Account | undefined> = []
  const order: string[] = []
  const showAccountSignInDialog = mock.fn<
    Dispatcher['showAccountSignInDialog']
  >(async (_endpoint, _login, resultCallback) => {
    callback = resultCallback
  })
  const closePopup = mock.fn<Dispatcher['closePopup']>(() => {
    order.push('close-sign-in')
  })
  const dispatcher: Pick<Dispatcher, 'showAccountSignInDialog' | 'closePopup'> =
    {
      showAccountSignInDialog,
      closePopup,
    }
  const props = {
    repository,
    accounts,
    dispatcher: dispatcher as Dispatcher,
    onComplete: (account: Account | undefined) => {
      completed.push(account)
      order.push('complete')
    },
    onDismissed: () => order.push('dismiss'),
  }
  const view = await renderDialog(<RepositoryAccountDialog {...props} />)
  return {
    ...view,
    completed,
    order,
    showAccountSignInDialog,
    closePopup,
    finishSignIn: (result: SignInResult) => {
      assert.ok(callback)
      callback(result)
    },
    updateAccounts: (updated: ReadonlyArray<Account>) =>
      view.rerender(<RepositoryAccountDialog {...props} accounts={updated} />),
  }
}

/** Let the account list measure itself, which it defers with setImmediate. */
async function flushImmediate() {
  await new Promise<void>(resolve => setImmediate(resolve))
  act(() => {})
}

async function openAccountPicker() {
  fireEvent.click(screen.getByRole('button', { name: 'Account', hidden: true }))
  advanceTimersBy(300)
  await flushImmediate()
}

function listedAccounts() {
  return screen
    .getAllByRole('option', { hidden: true })
    .map(option => option.getAttribute('aria-label'))
}

function chooseListedAccount(login: string) {
  fireEvent.click(
    screen.getByRole('option', {
      name: new RegExp(`^@${login} `),
      hidden: true,
    })
  )
  advanceTimersBy(300)
}

async function selectAccount(login: string) {
  await openAccountPicker()
  chooseListedAccount(login)
}

function queryButton(name: string) {
  return screen.queryByRole('button', { name, hidden: true })
}

function click(name: string) {
  fireEvent.click(screen.getByRole('button', { name, hidden: true }))
}

describe('RepositoryAccountDialog', () => {
  it('does not preselect even one account and filters by endpoint', async () => {
    const view = await renderAccountDialog(createRepository(), [
      personal,
      enterprise,
    ])
    assert.ok(view.container.querySelector('.account-picker .placeholder'))
    await openAccountPicker()
    assert.deepStrictEqual(listedAccounts(), ['@personal GitHub.com'])
    click('Use account')
    assert.deepStrictEqual(view.completed, [])
    chooseListedAccount(personal.login)
    click('Use account')
    assert.deepStrictEqual(view.completed, [personal])
    assert.deepStrictEqual(view.order, ['complete', 'dismiss'])
  })

  it('cancels without an account', async () => {
    const view = await renderAccountDialog()
    click('Cancel')
    assert.deepStrictEqual(view.completed, [undefined])
    assert.deepStrictEqual(view.order, ['complete', 'dismiss'])
  })

  it('targets the assigned signed-out identity and completes after sign-in', async () => {
    const view = await renderAccountDialog(createRepository('personal'), [work])
    assert.ok(screen.getByText(/assigned to @personal on GitHub\.com\./))
    assert.strictEqual(screen.queryByText(/api\.github\.com/), null)
    click('Sign in')
    assert.deepStrictEqual(
      view.showAccountSignInDialog.mock.calls[0].arguments.slice(0, 2),
      [endpoint, 'personal']
    )
    view.updateAccounts([work, personal])
    view.finishSignIn({ kind: 'success', account: personal })
    assert.deepStrictEqual(view.completed, [personal])
    assert.deepStrictEqual(view.closePopup.mock.calls[0].arguments, [
      PopupType.SignIn,
    ])
    assert.deepStrictEqual(view.order, ['close-sign-in', 'complete', 'dismiss'])
  })

  it('accepts the assigned identity with different login casing', async () => {
    const view = await renderAccountDialog(createRepository('Personal'), [])
    click('Sign in')
    view.finishSignIn({ kind: 'success', account: personal })
    assert.deepStrictEqual(view.completed, [personal])
  })

  it('keeps the prompt on cancelled targeted sign-in and allows another account', async () => {
    const view = await renderAccountDialog(createRepository('personal'), [work])
    click('Sign in')
    view.finishSignIn({ kind: 'cancelled' })
    assert.deepStrictEqual(view.completed, [])
    click('Choose another account')
    await selectAccount('work')
    click('Use account')
    assert.deepStrictEqual(view.completed, [work])
  })

  it('does not offer signing in to another account', async () => {
    await renderAccountDialog(createRepository(), [personal])
    assert.strictEqual(queryButton('Sign in to another account'), null)
  })

  it('offers another account only when one is signed in on the endpoint', async () => {
    await renderAccountDialog(createRepository('personal'), [enterprise])
    assert.ok(queryButton('Sign in'))
    assert.strictEqual(queryButton('Choose another account'), null)
  })

  it('names GitHub.com rather than its API endpoint when choosing an account', async () => {
    await renderAccountDialog(createRepository(), [personal])
    assert.ok(screen.getByText(/for repository on GitHub\.com\./))
    assert.strictEqual(screen.queryByText(/api\.github\.com/), null)
  })

  it('names the enterprise host rather than its API endpoint', async () => {
    await renderAccountDialog(createRepository(null, enterpriseEndpoint), [])
    assert.ok(screen.getByText(/for repository on enterprise\.example\.com\./))
    assert.strictEqual(screen.queryByText(/\/api\/v3/), null)
  })

  it('names the enterprise host for a signed-out assigned account', async () => {
    await renderAccountDialog(createRepository('work', enterpriseEndpoint), [])
    assert.ok(
      screen.getByText(/assigned to @work on enterprise\.example\.com\./)
    )
    assert.strictEqual(screen.queryByText(/\/api\/v3/), null)
  })
})

describe('ConfirmAccountSignOut', () => {
  for (const action of ['keep', 'clear', 'cancel']) {
    it(`${action} resolves without mutating accounts`, async () => {
      const { ConfirmAccountSignOut } = await import(
        '../../../src/ui/repository-account/confirm-account-sign-out'
      )
      const results: Array<boolean | undefined> = []
      let dismissed = 0
      await renderDialog(
        <ConfirmAccountSignOut
          account={personal}
          repositoryCount={2}
          onComplete={result => results.push(result)}
          onDismissed={() => dismissed++}
        />
      )
      const checkbox = screen.getByRole('checkbox', { hidden: true })
      assert.ok(checkbox instanceof HTMLInputElement)
      assert.strictEqual(checkbox.checked, false)
      assert.ok(screen.getByText(/2 repositories are assigned to @personal/))
      if (action === 'clear') {
        fireEvent.click(checkbox)
      }
      click(action === 'cancel' ? 'Cancel' : 'Sign out')
      assert.deepStrictEqual(results, [
        action === 'cancel' ? undefined : action === 'clear',
      ])
      assert.strictEqual(dismissed, 1)
    })
  }
})
