import assert from 'node:assert'
import { mkdir, writeFile } from 'fs/promises'
import * as Path from 'path'
import { describe, it, TestContext } from 'node:test'
import * as React from 'react'

import { API, IAPIRepositoryCloneInfo } from '../../../src/lib/api'
import { Account } from '../../../src/models/account'
import { CloneRepositoryTab } from '../../../src/models/clone-repository-tab'
import { CloneRepository } from '../../../src/ui/clone-repository/clone-repository'
import type { Dispatcher } from '../../../src/ui/dispatcher'
import { setDefaultDir } from '../../../src/ui/lib/default-dir'
import {
  createMockAPI,
  createMockAPIIdentity,
  createMockAPIRepository,
} from '../../helpers/mock-api'
import { createTempDirectory } from '../../helpers/temp'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

const applicationPathError =
  'The local path cannot end in .app on macOS. Choose a different folder name to avoid creating an application bundle.'

async function renderCloneDialog(
  t: TestContext,
  initialURL = 'https://example.com/owner/repository.git',
  darwin = true
) {
  const electron = await import('electron')
  const originalDarwin = __DARWIN__
  const originalSend = electron.ipcRenderer.send
  const originalDefaultDir = localStorage.getItem('last-clone-location')
  Object.assign(globalThis, { __DARWIN__: darwin })
  electron.ipcRenderer.send = () => {}
  t.after(() => {
    Object.assign(globalThis, { __DARWIN__: originalDarwin })
    electron.ipcRenderer.send = originalSend
    if (originalDefaultDir === null) {
      localStorage.removeItem('last-clone-location')
    } else {
      setDefaultDir(originalDefaultDir)
    }
  })

  const directory = await createTempDirectory(t)
  setDefaultDir(directory)
  const clone = t.mock.fn<Dispatcher['clone']>()
  const dispatcher: Pick<Dispatcher, 'clone' | 'closeFoldout'> = {
    clone,
    closeFoldout: t.mock.fn<Dispatcher['closeFoldout']>(),
  }
  const view = render(
    <CloneRepository
      dispatcher={dispatcher as Dispatcher}
      onDismissed={t.mock.fn()}
      accounts={[]}
      initialURL={initialURL}
      selectedTab={CloneRepositoryTab.Generic}
      selectedAccount={null}
      onTabSelected={t.mock.fn()}
      apiRepositories={new Map()}
      onRefreshRepositories={t.mock.fn()}
      isTopMost={true}
    />
  )

  const pathInput = screen.getByRole('textbox', {
    name: /Local path/i,
    hidden: true,
  })
  assert.ok(pathInput instanceof HTMLInputElement)
  await waitFor(() => assert.notStrictEqual(pathInput.value, ''))
  const cloneButton = screen.getByRole('button', {
    name: 'Clone',
    hidden: true,
  })
  assert.ok(cloneButton instanceof HTMLButtonElement)

  return { ...view, directory, pathInput, cloneButton, clone }
}

describe('CloneRepository path validation', () => {
  for (const suffix of ['.app', '.APP.git', '.App.git/']) {
    it(`rejects an automatically derived ${suffix} destination without renaming it`, async t => {
      const { directory, pathInput, cloneButton } = await renderCloneDialog(
        t,
        `https://github.com/owner/repository${suffix}`
      )

      await waitFor(() => assert.ok(screen.getByText(applicationPathError)))
      assert.strictEqual(
        pathInput.value,
        Path.join(directory, `repository${suffix.replace(/\.git\/?$/, '')}`)
      )
      assert.strictEqual(cloneButton.getAttribute('aria-disabled'), 'true')
    })
  }

  it('validates edited paths, normalizes trailing separators, and clears the error after correction', async t => {
    const { directory, pathInput, cloneButton } = await renderCloneDialog(t)
    await waitFor(() =>
      assert.strictEqual(cloneButton.getAttribute('aria-disabled'), null)
    )

    for (const name of [
      'repository.app',
      'repository.APP/',
      '.app',
      'repository.app/.',
    ]) {
      const path = `${directory}/${name}`
      fireEvent.change(pathInput, { target: { value: path } })

      await waitFor(() => assert.ok(screen.getByText(applicationPathError)))
      assert.strictEqual(pathInput.value, path)
      assert.strictEqual(cloneButton.getAttribute('aria-disabled'), 'true')
    }

    fireEvent.change(pathInput, {
      target: { value: Path.join(directory, 'repository.app-source') },
    })
    await waitFor(() =>
      assert.strictEqual(cloneButton.getAttribute('aria-disabled'), null)
    )
    assert.strictEqual(screen.queryByText(applicationPathError), null)
  })

  it('rejects an existing empty .app folder', async t => {
    const { directory, pathInput, cloneButton } = await renderCloneDialog(t)
    const path = Path.join(directory, 'empty.app')
    await mkdir(path)
    fireEvent.change(pathInput, { target: { value: path } })

    await waitFor(() => assert.ok(screen.getByText(applicationPathError)))
    assert.strictEqual(cloneButton.getAttribute('aria-disabled'), 'true')
  })

  it('validates paths derived after editing the repository URL', async t => {
    const { directory, pathInput, cloneButton } = await renderCloneDialog(t)
    const urlInput = screen.getByRole('textbox', {
      name: /Repository URL/,
      hidden: true,
    })
    fireEvent.change(urlInput, {
      target: { value: 'https://example.com/owner/changed.app.git' },
    })

    await waitFor(() => assert.ok(screen.getByText(applicationPathError)))
    assert.strictEqual(pathInput.value, Path.join(directory, 'changed.app'))
    assert.strictEqual(cloneButton.getAttribute('aria-disabled'), 'true')

    fireEvent.change(urlInput, {
      target: { value: 'https://example.com/owner/changed.git' },
    })
    await waitFor(() =>
      assert.strictEqual(cloneButton.getAttribute('aria-disabled'), null)
    )
    assert.strictEqual(pathInput.value, Path.join(directory, 'changed'))
    assert.strictEqual(screen.queryByText(applicationPathError), null)
  })

  it('validates a path chosen through the macOS directory picker', async t => {
    const { directory, pathInput, cloneButton } = await renderCloneDialog(t)
    const path = Path.join(directory, 'chosen.app')
    const electron = await import('electron')
    t.mock.method(electron.ipcRenderer, 'invoke', async (channel: string) => {
      assert.strictEqual(channel, 'show-save-dialog')
      return path
    })

    fireEvent.click(
      screen.getByRole('button', { name: 'Choose…', hidden: true })
    )

    await waitFor(() => assert.ok(screen.getByText(applicationPathError)))
    assert.strictEqual(pathInput.value, path)
    assert.strictEqual(cloneButton.getAttribute('aria-disabled'), 'true')
  })

  it('does not dispatch a clone when an invalid path is submitted directly', async t => {
    const { directory, pathInput, container, clone } = await renderCloneDialog(
      t
    )
    fireEvent.change(pathInput, {
      target: { value: Path.join(directory, 'repository.app') },
    })
    const form = container.querySelector('form')
    assert.ok(form)
    fireEvent.submit(form)

    await waitFor(() => {
      assert.ok(screen.getByText(applicationPathError))
      assert.strictEqual(container.querySelector('.dialog-header .spin'), null)
    })
    assert.strictEqual(clone.mock.callCount(), 0)
  })

  it('preserves existing non-empty directory validation', async t => {
    const { directory, pathInput, cloneButton } = await renderCloneDialog(t)
    await writeFile(Path.join(directory, 'file.txt'), 'existing file')
    fireEvent.change(pathInput, { target: { value: directory } })

    await waitFor(() =>
      assert.ok(
        screen.getByText(
          'This folder contains files. Git can only clone to empty folders.'
        )
      )
    )
    assert.strictEqual(cloneButton.getAttribute('aria-disabled'), 'true')
  })

  it('clones to a corrected destination without changing the repository URL', async t => {
    const url = 'https://example.com/owner/repository.app.git'
    const { directory, pathInput, container, clone } = await renderCloneDialog(
      t,
      url
    )
    await waitFor(() => assert.ok(screen.getByText(applicationPathError)))
    const path = Path.join(directory, 'repository-source')
    fireEvent.change(pathInput, { target: { value: path } })
    const form = container.querySelector('form')
    assert.ok(form)
    fireEvent.submit(form)

    await waitFor(() => assert.strictEqual(clone.mock.callCount(), 1))
    assert.deepStrictEqual(clone.mock.calls[0].arguments, [
      url,
      path,
      { defaultBranch: undefined },
    ])
  })

  it('allows .app destinations on other platforms', async t => {
    const { directory, pathInput, cloneButton } = await renderCloneDialog(
      t,
      'https://github.com/owner/repository.app.git',
      false
    )

    await waitFor(() =>
      assert.strictEqual(cloneButton.getAttribute('aria-disabled'), null)
    )
    assert.strictEqual(pathInput.value, Path.join(directory, 'repository.app'))
    assert.strictEqual(screen.queryByText(applicationPathError), null)
  })
})

describe('CloneRepository URL tab without an accessible account', () => {
  function mockInaccessibleRepository(t: TestContext) {
    t.mock.method(API, 'fromAccount', () =>
      createMockAPI({ fetchRepositoryCloneInfo: async () => null })
    )
  }

  it('clones an SSH URL as entered and unassociated', async t => {
    mockInaccessibleRepository(t)
    const url = 'git@github.com:owner/private.git'
    const { container, cloneButton, pathInput, clone } =
      await renderCloneDialog(t, url)
    await waitFor(() =>
      assert.strictEqual(cloneButton.getAttribute('aria-disabled'), null)
    )
    const form = container.querySelector('form')
    assert.ok(form)
    fireEvent.submit(form)

    await waitFor(() => assert.strictEqual(clone.mock.callCount(), 1))
    assert.deepStrictEqual(clone.mock.calls[0].arguments, [
      url,
      pathInput.value,
      { defaultBranch: undefined },
    ])
  })

  it('shows the access error for an HTTPS URL', async t => {
    mockInaccessibleRepository(t)
    const { container, cloneButton, clone } = await renderCloneDialog(
      t,
      'https://github.com/owner/private.git'
    )
    await waitFor(() =>
      assert.strictEqual(cloneButton.getAttribute('aria-disabled'), null)
    )
    const form = container.querySelector('form')
    assert.ok(form)
    fireEvent.submit(form)

    await waitFor(() =>
      assert.ok(screen.getByText(/We couldn't find that repository/))
    )
    assert.strictEqual(clone.mock.callCount(), 0)
  })
})

/** Reports a fixed size so the virtualized lists render their rows. */
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

describe('CloneRepository GitHub tab account changes', () => {
  const dotCom = 'https://api.github.com'
  const enterprise = 'https://ghe.example.com/api/v3'
  const alice = new Account('alice', dotCom, 'alice-token', [], '', 1, '')
  const bob = new Account('bob', dotCom, 'bob-token', [], '', 2, '')
  const carol = new Account('carol', enterprise, 'carol-token', [], '', 3, '')

  const repository = (owner: string, name: string) =>
    createMockAPIRepository({
      name,
      clone_url: `https://github.com/${owner}/${name}.git`,
      html_url: `https://github.com/${owner}/${name}`,
      owner: createMockAPIIdentity({ login: owner }),
    })
  const shared = repository('shared', 'repo')
  const apiRepositories = new Map([
    [
      alice,
      { repositories: [repository('alice', 'a'), shared], loading: false },
    ],
    [bob, { repositories: [repository('bob', 'b'), shared], loading: false }],
    [carol, { repositories: [], loading: false }],
  ])

  async function renderGitHubTab(
    t: TestContext,
    accounts: ReadonlyArray<Account>,
    fetchRepositoryCloneInfo: API['fetchRepositoryCloneInfo'] = async () => null
  ) {
    const originalResizeObserver = window.ResizeObserver
    Object.assign(window, { ResizeObserver: SizedResizeObserver })
    const electron = await import('electron')
    const originalSend = electron.ipcRenderer.send
    electron.ipcRenderer.send = () => {}
    t.after(() => {
      Object.assign(window, { ResizeObserver: originalResizeObserver })
      electron.ipcRenderer.send = originalSend
    })
    t.mock.method(API, 'fromAccount', () =>
      createMockAPI({ fetchRepositoryCloneInfo })
    )
    setDefaultDir(await createTempDirectory(t))

    const clone = t.mock.fn<Dispatcher['clone']>()
    const changeCloneRepositoriesAccount =
      t.mock.fn<Dispatcher['changeCloneRepositoriesAccount']>()
    const dispatcher: Pick<
      Dispatcher,
      'clone' | 'closeFoldout' | 'changeCloneRepositoriesAccount'
    > = {
      clone,
      closeFoldout: t.mock.fn<Dispatcher['closeFoldout']>(),
      changeCloneRepositoriesAccount,
    }
    const element = (
      accounts: ReadonlyArray<Account>,
      selectedAccount: Account | null
    ) => (
      <CloneRepository
        dispatcher={dispatcher as Dispatcher}
        onDismissed={t.mock.fn()}
        accounts={accounts}
        initialURL={null}
        selectedTab={CloneRepositoryTab.GitHub}
        onTabSelected={t.mock.fn()}
        selectedAccount={selectedAccount}
        apiRepositories={apiRepositories}
        onRefreshRepositories={t.mock.fn()}
        isTopMost={true}
      />
    )
    const view = render(element(accounts, null))
    const cloneButton = screen.getByRole('button', {
      name: 'Clone',
      hidden: true,
    })
    const rerender = (
      accounts: ReadonlyArray<Account>,
      selectedAccount: Account | null
    ) => view.rerender(element(accounts, selectedAccount))
    return {
      view,
      cloneButton,
      rerender,
      clone,
      changeCloneRepositoriesAccount,
    }
  }

  async function selectRepository(name: RegExp) {
    // Match on text since filter highlighting splits up the accessible name.
    const item = await waitFor(() => {
      const option = screen
        .queryAllByRole('option', { hidden: true })
        .find(o => name.test(o.textContent ?? ''))
      assert.ok(option)
      return option
    })
    fireEvent.mouseDown(item)
    fireEvent.mouseUp(item)
    fireEvent.click(item)
  }

  const waitForCloneEnabled = (button: HTMLElement, enabled: boolean) =>
    waitFor(() =>
      assert.strictEqual(
        button.getAttribute('aria-disabled'),
        enabled ? null : 'true'
      )
    )

  it('leaves signing in to other accounts to Settings', async t => {
    const { view } = await renderGitHubTab(t, [alice, bob])
    assert.ok(view.container.querySelector('.account-picker'))
    assert.strictEqual(
      screen.queryByRole('button', {
        name: /sign in to another account/i,
        hidden: true,
      }),
      null
    )
  })

  it('clears the selection when the selected account is signed out', async t => {
    const { view, cloneButton, rerender } = await renderGitHubTab(t, [
      alice,
      carol,
    ])
    await selectRepository(/alice\/a/)
    await waitForCloneEnabled(cloneButton, true)

    // Alice is signed out while the dialog is open, so the tab falls back to
    // Carol on another host.
    rerender([carol], null)
    await waitFor(() =>
      assert.strictEqual(
        view.container.querySelector('.account-picker .login')?.textContent,
        '@carol'
      )
    )
    await waitForCloneEnabled(cloneButton, false)

    assert.strictEqual(
      screen.queryByRole('option', { selected: true, hidden: true }),
      null
    )
  })

  it('clears the filter when switching accounts so a shared repository can be cloned', async t => {
    const { view, cloneButton, rerender, changeCloneRepositoriesAccount } =
      await renderGitHubTab(t, [alice, bob])
    const filter = await waitFor(() =>
      screen.getByPlaceholderText('Filter your repositories')
    )
    fireEvent.change(filter, { target: { value: 'shared' } })
    await selectRepository(/shared\/repo/)
    await waitForCloneEnabled(cloneButton, true)

    fireEvent.click(
      screen.getByRole('button', { name: 'Account', hidden: true })
    )
    const bobItem = await waitFor(() =>
      screen.getByRole('option', { name: /@bob/, hidden: true })
    )
    fireEvent.click(bobItem)
    assert.strictEqual(changeCloneRepositoriesAccount.mock.callCount(), 1)

    await waitFor(() => {
      const input = screen.getByPlaceholderText('Filter your repositories')
      assert.ok(input instanceof HTMLInputElement)
      assert.strictEqual(input.value, '')
    })
    await waitForCloneEnabled(cloneButton, false)

    await selectRepository(/shared\/repo/)
    await waitForCloneEnabled(cloneButton, true)

    // The picked account arriving through props doesn't reset the tab again.
    rerender([alice, bob], bob)
    await new Promise(resolve => setTimeout(resolve, 50))
    await waitForCloneEnabled(cloneButton, true)
    assert.strictEqual(
      view.container.querySelector('.account-picker .login')?.textContent,
      '@bob'
    )
  })

  it('clones with the account selected when Clone was pressed', async t => {
    let resolveLookup = (_: IAPIRepositoryCloneInfo) => {}
    const lookup = new Promise<IAPIRepositoryCloneInfo>(resolve => {
      resolveLookup = resolve
    })
    const { view, cloneButton, rerender, clone } = await renderGitHubTab(
      t,
      [alice, bob],
      () => lookup
    )
    await selectRepository(/alice\/a/)
    await waitForCloneEnabled(cloneButton, true)

    const form = view.container.querySelector('form')
    assert.ok(form)
    fireEvent.submit(form)

    // The dialog can't be changed while the repository is being looked up.
    const fieldset = view.container.querySelector('fieldset')
    assert.ok(fieldset)
    await waitFor(() => assert.strictEqual(fieldset.disabled, true))

    // The account still changes, e.g. after signing in from elsewhere.
    rerender([alice, bob], bob)
    await waitFor(() =>
      assert.strictEqual(
        view.container.querySelector('.account-picker .login')?.textContent,
        '@bob'
      )
    )
    resolveLookup({
      url: 'https://github.com/alice/a.git',
      defaultBranch: 'main',
    })

    await waitFor(() => assert.strictEqual(clone.mock.callCount(), 1))
    const [url, , options] = clone.mock.calls[0].arguments
    assert.strictEqual(url, 'https://github.com/alice/a.git')
    assert.deepStrictEqual(options, {
      defaultBranch: 'main',
      account: { endpoint: dotCom, login: 'alice' },
    })
  })
})
