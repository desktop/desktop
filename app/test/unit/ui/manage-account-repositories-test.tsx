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
import { Repository } from '../../../src/models/repository'
import type { Dispatcher } from '../../../src/ui/dispatcher'
import { ManageAccountRepositoriesDialog } from '../../../src/ui/repository-account/manage-account-repositories-dialog'
import { DialogStackContext } from '../../../src/ui/dialog/dialog'
import { fireEvent, render, screen, within } from '../../helpers/ui/render'
import {
  advanceTimersBy,
  enableTestTimers,
  resetTestTimers,
} from '../../helpers/ui/timers'

const dotCom = 'https://api.github.com'
const enterprise = 'https://enterprise.example.com/api/v3'
const alice = new Account('alice', dotCom, 'token', [], '', 1, '')
const bob = new Account('bob', dotCom, 'token', [], '', 2, '')

function createRepository(
  id: number,
  name: string,
  login: string | null = null,
  endpoint = dotCom
) {
  return new Repository(
    `/repos/${name}`,
    id,
    new GitHubRepository(name, new Owner('owner', endpoint, 1), id),
    false,
    null,
    {},
    false,
    undefined,
    undefined,
    login
  )
}

const repositories = [
  createRepository(1, 'unassigned'),
  createRepository(2, 'mine', 'alice'),
  createRepository(3, 'bobs', 'bob'),
  createRepository(4, 'carols', 'carol'),
  createRepository(5, 'enterprise', null, enterprise),
]

const showModalDescriptor = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  'showModal'
)
const closeDescriptor = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  'close'
)

function restore(name: 'showModal' | 'close', d?: PropertyDescriptor) {
  if (d === undefined) {
    Reflect.deleteProperty(HTMLDialogElement.prototype, name)
  } else {
    Object.defineProperty(HTMLDialogElement.prototype, name, d)
  }
}

let originalSend: ((channel: string, ...args: any[]) => void) | undefined

before(async () => {
  const electron = await import('electron')
  originalSend = electron.ipcRenderer.send
  electron.ipcRenderer.send = () => {}
})

after(async () => {
  if (originalSend !== undefined) {
    const electron = await import('electron')
    electron.ipcRenderer.send = originalSend
  }
})

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
  restore('showModal', showModalDescriptor)
  restore('close', closeDescriptor)
})

function renderDialog(repos: ReadonlyArray<Repository> = repositories) {
  const updateAccountRepositories = mock.fn<
    Dispatcher['updateAccountRepositories']
  >(async () => {})
  const dispatcher: Pick<Dispatcher, 'updateAccountRepositories'> = {
    updateAccountRepositories,
  }
  let dismissed = 0
  const view = render(
    <DialogStackContext.Provider value={{ isTopMost: true }}>
      <ManageAccountRepositoriesDialog
        account={alice}
        accounts={[alice, bob]}
        repositories={repos}
        dispatcher={dispatcher as Dispatcher}
        onDismissed={() => dismissed++}
      />
    </DialogStackContext.Provider>
  )
  advanceTimersBy(300)
  return { ...view, updateAccountRepositories, dismissed: () => dismissed }
}

function rows() {
  return screen.getAllByRole('listitem', { hidden: true }).map(row => {
    const checkbox = within(row).getByRole('checkbox', { hidden: true })
    assert.ok(checkbox instanceof HTMLInputElement)
    const association = row.querySelector('.account-repository-association')
    return [
      row.querySelector('label')?.textContent,
      association?.textContent,
      checkbox.checked,
    ]
  })
}

function button(name: string) {
  return screen.queryByRole('button', { name, hidden: true })
}

async function flush() {
  await new Promise<void>(resolve => setImmediate(resolve))
}

describe('ManageAccountRepositoriesDialog', () => {
  it('lists every repository on the host with its current association', () => {
    renderDialog()
    assert.deepStrictEqual(rows(), [
      ['bobs', '@bob', false],
      ['carols', '@carol (signed out)', false],
      ['mine', '@alice (this account)', true],
      ['unassigned', 'Unassigned', true],
    ])
  })

  it('assigns the selected repositories', async () => {
    const view = renderDialog()
    const assign = button('Assign selected')
    assert.ok(assign !== null)
    const toggle = (name: string) =>
      fireEvent.click(screen.getByRole('checkbox', { name, hidden: true }))

    toggle('unassigned')
    assert.strictEqual(assign.getAttribute('aria-disabled'), 'true')

    toggle('unassigned')
    toggle('bobs')
    assert.strictEqual(assign.getAttribute('aria-disabled'), null)
    fireEvent.click(assign)
    await flush()

    const [account, shown, selected] =
      view.updateAccountRepositories.mock.calls[0].arguments
    assert.strictEqual(account, alice)
    assert.deepStrictEqual([...shown].sort(), [1, 2, 3, 4])
    assert.deepStrictEqual([...selected].sort(), [1, 2, 3])
    assert.strictEqual(view.dismissed(), 1)
  })

  it('filters repositories and selects only the filtered ones', () => {
    renderDialog()
    fireEvent.click(button('Select none')!)
    assert.ok(rows().every(([, , checked]) => checked === false))

    const filter = screen.getByRole('searchbox', {
      name: 'Filter repositories',
      hidden: true,
    })
    fireEvent.change(filter, { target: { value: 'ARO' } })
    advanceTimersBy(300)
    fireEvent.click(button('Select all')!)
    assert.deepStrictEqual(rows(), [['carols', '@carol (signed out)', true]])
  })

  it('shows an error and stays open when assigning fails', async () => {
    const view = renderDialog()
    view.updateAccountRepositories.mock.mockImplementation(async () => {
      throw new Error('@alice is no longer signed in.')
    })
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'bobs', hidden: true })
    )
    fireEvent.click(button('Assign selected')!)
    await flush()
    assert.ok(screen.getByText('@alice is no longer signed in.'))
    assert.strictEqual(view.dismissed(), 0)
  })

  it('explains there are no repositories to assign', () => {
    const view = renderDialog([repositories[4]])
    assert.ok(
      screen.getByText(/There are no repositories on GitHub\.com to assign/)
    )
    assert.strictEqual(button('Assign selected'), null)
    const footer = document.querySelector('.dialog-footer')
    assert.ok(footer instanceof HTMLElement)
    fireEvent.click(
      within(footer).getByRole('button', { name: 'Close', hidden: true })
    )
    assert.strictEqual(view.dismissed(), 1)
  })
})
