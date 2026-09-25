import assert from 'node:assert'
import { before, beforeEach, describe, it, mock } from 'node:test'
import * as React from 'react'
import { Account } from '../../../src/models/account'
import { GitHubRepository } from '../../../src/models/github-repository'
import { Owner } from '../../../src/models/owner'
import { Repository } from '../../../src/models/repository'
import type { Dispatcher } from '../../../src/ui/dispatcher'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

const endpoint = 'https://api.github.com'
const personal = new Account('personal', endpoint, 'token', [], '', 1, '')
const work = new Account('work', endpoint, 'token', [], '', 2, '')
const enterprise = new Account(
  'enterprise',
  'https://enterprise.example.com/api/v3',
  'token',
  [],
  '',
  3,
  ''
)
const setConfigValue = mock.fn(async () => {})
const remote = {
  name: 'origin',
  url: 'https://github.com/owner/repository',
  fetch: '+refs/heads/*:refs/remotes/origin/*',
}

before(() => {
  mock.module('../../../src/lib/git/index.ts', {
    namedExports: { readGitIgnoreAtRoot: async () => '' },
  })
  mock.module('../../../src/lib/git/config.ts', {
    namedExports: {
      getConfigValue: async () => null,
      getGlobalConfigValue: async () => '',
      setConfigValue,
      removeConfigValue: async () => {},
    },
  })
  mock.module('../../../src/ui/main-process-proxy.ts', {
    namedExports: { sendDialogDidOpen: () => {} },
  })
})

beforeEach(() => setConfigValue.mock.resetCalls())

function createRepository(login: string | null = null, github = true) {
  return new Repository(
    '/repository',
    1,
    github
      ? new GitHubRepository('repository', new Owner('owner', endpoint, 1), 1)
      : null,
    false,
    null,
    {},
    false,
    undefined,
    undefined,
    login
  )
}

async function renderSettings(repository = createRepository()) {
  const { RepositorySettings } = await import(
    '../../../src/ui/repository-settings/repository-settings'
  )
  const updateRepositoryAccount = mock.fn<
    Dispatcher['updateRepositoryAccount']
  >(async () => {})
  const setRemoteURL = mock.fn<Dispatcher['setRemoteURL']>(async () => {})
  const refreshAuthor = mock.fn<Dispatcher['refreshAuthor']>(async () => {})
  const onDismissed = mock.fn()
  const dispatcher: Pick<
    Dispatcher,
    | 'updateRepositoryAccount'
    | 'setRemoteURL'
    | 'refreshAuthor'
    | 'updateRepositoryWorkflowPreferences'
  > = {
    updateRepositoryAccount,
    setRemoteURL,
    refreshAuthor,
    updateRepositoryWorkflowPreferences: async () => {},
  }
  const props = {
    repository,
    accounts: [personal, work, enterprise],
    repositoryAccount: null,
    dispatcher: dispatcher as Dispatcher,
    remote,
    onDismissed,
  }
  const view = render(<RepositorySettings {...props} />)
  await waitFor(() =>
    assert.ok(screen.getByRole('button', { name: 'Save', hidden: true }))
  )
  return {
    ...view,
    onDismissed,
    updateRepositoryAccount,
    setRemoteURL,
    refreshAuthor,
    update: (updatedRepository = repository, accounts = props.accounts) =>
      view.rerender(
        <RepositorySettings
          {...props}
          repository={updatedRepository}
          accounts={accounts}
        />
      ),
  }
}

function accountSelect() {
  const select = screen.getByRole('combobox', { hidden: true })
  assert.ok(select instanceof HTMLSelectElement)
  return select
}

function save() {
  fireEvent.click(screen.getByRole('button', { name: 'Save', hidden: true }))
}

describe('RepositorySettings account', () => {
  it('shows only matching accounts and does not implicitly assign one when saved', async () => {
    const view = await renderSettings()
    const select = accountSelect()
    assert.strictEqual(select.value, '')
    assert.deepStrictEqual(
      Array.from(select.options).map(option => option.value),
      ['', 'personal', 'work']
    )
    save()
    await waitFor(() =>
      assert.strictEqual(view.onDismissed.mock.callCount(), 1)
    )
    assert.strictEqual(view.updateRepositoryAccount.mock.callCount(), 0)
  })

  it('preserves and displays an assigned signed-out login without saving it again', async () => {
    const view = await renderSettings(createRepository('signed-out'))
    assert.strictEqual(accountSelect().value, 'signed-out')
    assert.ok(
      screen.getByRole('option', {
        name: '@signed-out (signed out)',
        hidden: true,
      })
    )
    save()
    await waitFor(() =>
      assert.strictEqual(view.onDismissed.mock.callCount(), 1)
    )
    assert.strictEqual(view.updateRepositoryAccount.mock.callCount(), 0)
  })

  it('saves explicit assignment without changing Git authorship', async () => {
    const repository = createRepository()
    const view = await renderSettings(repository)
    fireEvent.change(accountSelect(), { target: { value: 'work' } })
    save()
    await waitFor(() =>
      assert.strictEqual(view.onDismissed.mock.callCount(), 1)
    )
    assert.deepStrictEqual(
      view.updateRepositoryAccount.mock.calls[0].arguments,
      [repository, 'work']
    )
    assert.strictEqual(setConfigValue.mock.callCount(), 0)
    assert.strictEqual(view.refreshAuthor.mock.callCount(), 0)
  })

  it('recognizes assigned logins without changing their casing on save', async () => {
    const view = await renderSettings(createRepository('Personal'))
    assert.strictEqual(accountSelect().value, 'personal')
    assert.strictEqual(
      screen.queryByRole('option', {
        name: /signed out/,
        hidden: true,
      }),
      null
    )
    save()
    await waitFor(() =>
      assert.strictEqual(view.onDismissed.mock.callCount(), 1)
    )
    assert.strictEqual(view.updateRepositoryAccount.mock.callCount(), 0)
  })

  it('supports explicitly clearing an assignment', async () => {
    const repository = createRepository('personal')
    const view = await renderSettings(repository)
    fireEvent.change(accountSelect(), { target: { value: '' } })
    save()
    await waitFor(() =>
      assert.strictEqual(view.onDismissed.mock.callCount(), 1)
    )
    assert.deepStrictEqual(
      view.updateRepositoryAccount.mock.calls[0].arguments,
      [repository, null]
    )
  })

  it('preserves account and remote edits across unrelated props updates', async () => {
    const view = await renderSettings()
    fireEvent.change(accountSelect(), { target: { value: 'work' } })
    const input = screen.getByRole('textbox', { hidden: true })
    fireEvent.change(input, {
      target: { value: 'https://github.com/owner/new' },
    })
    view.update(createRepository(), [personal, work])
    assert.strictEqual(accountSelect().value, 'work')
    assert.ok(input instanceof HTMLInputElement)
    assert.strictEqual(input.value, 'https://github.com/owner/new')
    save()
    await waitFor(() =>
      assert.strictEqual(view.onDismissed.mock.callCount(), 1)
    )
    assert.strictEqual(view.updateRepositoryAccount.mock.callCount(), 1)
    assert.strictEqual(view.setRemoteURL.mock.callCount(), 1)
  })

  it('does not overwrite external assignment updates when the field is untouched', async () => {
    const view = await renderSettings()
    view.update(createRepository('personal'))
    assert.strictEqual(accountSelect().value, 'personal')
    save()
    await waitFor(() =>
      assert.strictEqual(view.onDismissed.mock.callCount(), 1)
    )
    assert.strictEqual(view.updateRepositoryAccount.mock.callCount(), 0)
  })

  it('retains the dialog and selection when saving the account fails', async () => {
    const view = await renderSettings()
    view.updateRepositoryAccount.mock.mockImplementation(async () => {
      throw new Error('Account could not be saved')
    })
    fireEvent.change(accountSelect(), { target: { value: 'work' } })
    save()
    await waitFor(() =>
      assert.ok(screen.getByText(/Failed saving the repository account/))
    )
    assert.strictEqual(view.onDismissed.mock.callCount(), 0)
    assert.strictEqual(accountSelect().value, 'work')
  })

  it('hides the selector for non-GitHub repositories', async () => {
    await renderSettings(createRepository(null, false))
    assert.strictEqual(screen.queryByRole('combobox', { hidden: true }), null)
  })
})
