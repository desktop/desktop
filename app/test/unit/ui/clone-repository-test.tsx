import assert from 'node:assert'
import { mkdir, writeFile } from 'fs/promises'
import * as Path from 'path'
import { describe, it, TestContext } from 'node:test'
import * as React from 'react'

import { CloneRepositoryTab } from '../../../src/models/clone-repository-tab'
import { Account } from '../../../src/models/account'
import { Repository } from '../../../src/models/repository'
import { API } from '../../../src/lib/api'
import { CloneRepository } from '../../../src/ui/clone-repository/clone-repository'
import type { Dispatcher } from '../../../src/ui/dispatcher'
import { setDefaultDir } from '../../../src/ui/lib/default-dir'
import { createTempDirectory } from '../../helpers/temp'
import { createMockAPIRepository } from '../../helpers/mock-api'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

const applicationPathError =
  'The local path cannot end in .app on macOS. Choose a different folder name to avoid creating an application bundle.'

class SizedResizeObserver implements ResizeObserver {
  public constructor(private readonly callback: ResizeObserverCallback) {}

  public observe(target: Element) {
    Object.defineProperty(target, 'offsetWidth', {
      configurable: true,
      value: 360,
    })
    Object.defineProperty(target, 'offsetHeight', {
      configurable: true,
      value: 360,
    })
    this.callback(
      [
        {
          target,
          contentRect: {
            x: 0,
            y: 0,
            width: 360,
            height: 360,
            top: 0,
            right: 360,
            bottom: 360,
            left: 0,
            toJSON: () => ({}),
          },
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

async function renderCloneDialog(
  t: TestContext,
  initialURL = 'https://example.com/owner/repository.git',
  darwin = true,
  accounts: ReadonlyArray<Account> = []
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
      accounts={accounts}
      initialURL={initialURL}
      selectedTab={CloneRepositoryTab.Generic}
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
  it('reports an access-check failure and allows retry after editing the URL', async t => {
    const account = new Account(
      'alice',
      'https://api.github.com',
      'token',
      [],
      '',
      1,
      'Alice'
    )
    t.mock.method(API.prototype, 'fetchRepository', async () => {
      throw new Error('Network unavailable')
    })
    const { container, cloneButton, clone } = await renderCloneDialog(
      t,
      'https://github.com/owner/private.git',
      true,
      [account]
    )
    const form = container.querySelector('form')
    assert.ok(form)
    await waitFor(() =>
      assert.strictEqual(cloneButton.getAttribute('aria-disabled'), null)
    )
    fireEvent.submit(form)

    await waitFor(() =>
      assert.ok(
        screen.getByText(
          'Unable to check repository access. Check your connection and try again.'
        )
      )
    )
    assert.strictEqual(clone.mock.callCount(), 0)

    fireEvent.change(
      screen.getByRole('textbox', { name: /Repository URL/, hidden: true }),
      { target: { value: 'https://github.com/owner/private-again.git' } }
    )
    await waitFor(() =>
      assert.strictEqual(cloneButton.getAttribute('aria-disabled'), null)
    )
  })

  it('does not choose the first host account for an inaccessible repository alias', async t => {
    const account = new Account(
      'alice',
      'https://api.github.com',
      'token',
      [],
      '',
      1,
      'Alice'
    )
    t.mock.method(API.prototype, 'fetchRepository', async () => null)
    const fetchCloneInfo = t.mock.method(
      API.prototype,
      'fetchRepositoryCloneInfo'
    )
    const { container, cloneButton, clone } = await renderCloneDialog(
      t,
      'owner/private',
      true,
      [account]
    )
    const form = container.querySelector('form')
    assert.ok(form)
    await waitFor(() =>
      assert.strictEqual(cloneButton.getAttribute('aria-disabled'), null)
    )
    fireEvent.submit(form)

    await waitFor(() =>
      assert.ok(screen.getByText(/We couldn't find that repository/))
    )
    assert.strictEqual(fetchCloneInfo.mock.callCount(), 0)
    assert.strictEqual(clone.mock.callCount(), 0)
  })

  it('resolves an accessible alias with its verified account', async t => {
    const account = new Account(
      'alice',
      'https://api.github.com',
      'token',
      [],
      '',
      1,
      'Alice'
    )
    t.mock.method(
      API.prototype,
      'fetchRepository',
      async () =>
        createMockAPIRepository() as unknown as NonNullable<
          Awaited<ReturnType<API['fetchRepository']>>
        >
    )
    const url = 'https://github.com/owner/private.git'
    t.mock.method(API.prototype, 'fetchRepositoryCloneInfo', async () => ({
      url,
      defaultBranch: 'main',
    }))
    const { container, cloneButton, clone } = await renderCloneDialog(
      t,
      'owner/private',
      true,
      [account]
    )
    const form = container.querySelector('form')
    assert.ok(form)
    await waitFor(() =>
      assert.strictEqual(cloneButton.getAttribute('aria-disabled'), null)
    )
    fireEvent.submit(form)

    await waitFor(() => assert.strictEqual(clone.mock.callCount(), 1))
    assert.strictEqual(clone.mock.calls[0].arguments[0], url)
    assert.strictEqual(clone.mock.calls[0].arguments[3], account)
  })

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

  describe('unmatched clone URLs', () => {
    async function renderAccountlessClone(
      t: TestContext,
      url: string,
      clone: Dispatcher['clone']
    ) {
      const electron = await import('electron')
      const originalSend = electron.ipcRenderer.send
      const originalDefaultDir = localStorage.getItem('last-clone-location')
      electron.ipcRenderer.send = () => {}
      setDefaultDir(process.cwd())
      t.after(() => {
        electron.ipcRenderer.send = originalSend
        if (originalDefaultDir === null) {
          localStorage.removeItem('last-clone-location')
        } else {
          setDefaultDir(originalDefaultDir)
        }
      })
      const dispatcher = {
        clone,
        closeFoldout: t.mock.fn(),
      } as unknown as Dispatcher
      const view = render(
        <CloneRepository
          dispatcher={dispatcher}
          onDismissed={t.mock.fn()}
          accounts={[]}
          initialURL={url}
          selectedTab={CloneRepositoryTab.Generic}
          onTabSelected={t.mock.fn()}
          apiRepositories={new Map()}
          onRefreshRepositories={t.mock.fn()}
          isTopMost={true}
        />
      )
      const form = view.container.querySelector('form')
      assert.ok(form)
      await waitFor(() =>
        assert.strictEqual(
          screen
            .getByRole('button', { name: 'Clone', hidden: true })
            .getAttribute('aria-disabled'),
          null
        )
      )
      fireEvent.submit(form)
    }

    it('keeps a successful unmatched SSH remote and explicitly leaves it unassociated', async t => {
      const url = 'git@github.com:owner/accountless-ssh-test.git'
      const repository = new Repository(
        Path.join(process.cwd(), 'accountless-ssh-test'),
        1,
        null,
        false
      )
      const clone = t.mock.fn<Dispatcher['clone']>(async () => repository)
      await renderAccountlessClone(t, url, clone)
      await waitFor(() => assert.strictEqual(clone.mock.callCount(), 1))
      assert.strictEqual(clone.mock.calls[0].arguments[0], url)
      assert.strictEqual(clone.mock.calls[0].arguments[3], null)
    })

    it('shows the access error when an HTTPS clone cannot be reached', async t => {
      const url = 'https://github.com/owner/accountless-https-test.git'
      const clone = t.mock.fn<Dispatcher['clone']>(async () => {
        throw new Error('Repository not found or access denied')
      })
      await renderAccountlessClone(t, url, clone)
      await waitFor(() =>
        assert.ok(screen.getByText('Repository not found or access denied'))
      )
      assert.strictEqual(clone.mock.calls[0].arguments[0], url)
    })
  })

  describe('authenticated clone browser', () => {
    it('shows one authenticated tab and a picker alongside the URL tab', async t => {
      const electron = await import('electron')
      const originalSend = electron.ipcRenderer.send
      const originalDefaultDir = localStorage.getItem('last-clone-location')
      const originalObserver = window.ResizeObserver
      window.ResizeObserver = SizedResizeObserver
      electron.ipcRenderer.send = () => {}
      setDefaultDir(process.cwd())
      t.after(() => {
        electron.ipcRenderer.send = originalSend
        window.ResizeObserver = originalObserver
        if (originalDefaultDir === null) {
          localStorage.removeItem('last-clone-location')
        } else {
          setDefaultDir(originalDefaultDir)
        }
      })
      const dotCom = new Account(
        'alice',
        'https://api.github.com',
        'token',
        [],
        '',
        1,
        'Alice'
      )
      const enterprise = new Account(
        'bob',
        'https://git.example.com/api/v3',
        'token',
        [],
        '',
        2,
        'Bob'
      )
      const apiRepositories = new Map([
        [
          dotCom,
          {
            repositories: [createMockAPIRepository({ name: 'alice-only' })],
            loading: false,
          },
        ],
        [
          enterprise,
          {
            repositories: [createMockAPIRepository({ name: 'bob-only' })],
            loading: false,
          },
        ],
      ])
      const view = render(
        <CloneRepository
          dispatcher={{} as Dispatcher}
          onDismissed={t.mock.fn()}
          accounts={[dotCom, enterprise]}
          initialURL={null}
          selectedTab={CloneRepositoryTab.DotCom}
          onTabSelected={t.mock.fn()}
          apiRepositories={apiRepositories}
          onRefreshRepositories={t.mock.fn()}
          isTopMost={true}
        />
      )
      assert.equal(view.container.querySelectorAll('[role="tab"]').length, 2)
      await waitFor(() =>
        assert.ok(view.container.textContent?.includes('octocat/alice-only'))
      )
      const accountButton = view.container.querySelector(
        '.account-picker button'
      )
      assert.ok(accountButton)
      fireEvent.click(accountButton)
      assert.ok(screen.getByText('Choose an account'))
    })
  })
  describe('CloneRepository account association', () => {
    it('asks which account to use for a URL accessible by two accounts', async t => {
      const electron = await import('electron')
      const originalSend = electron.ipcRenderer.send
      const originalDefaultDir = localStorage.getItem('last-clone-location')
      electron.ipcRenderer.send = () => {}
      setDefaultDir(process.cwd())
      t.after(() => {
        electron.ipcRenderer.send = originalSend
        if (originalDefaultDir === null) {
          localStorage.removeItem('last-clone-location')
        } else {
          setDefaultDir(originalDefaultDir)
        }
      })
      const accounts = [1, 2].map(
        id =>
          new Account(
            `user${id}`,
            'https://api.github.com',
            'token',
            [],
            '',
            id,
            `User ${id}`
          )
      )
      const url = 'git@github.com:owner/account-choice-test.git'
      t.mock.method(
        API.prototype,
        'fetchRepository',
        async () =>
          createMockAPIRepository() as unknown as NonNullable<
            Awaited<ReturnType<API['fetchRepository']>>
          >
      )
      t.mock.method(API.prototype, 'fetchRepositoryCloneInfo', async () => ({
        url,
        defaultBranch: 'main',
      }))
      const repository = new Repository(
        Path.join(process.cwd(), 'account-choice-test'),
        1,
        null,
        false
      )
      const clone = t.mock.fn<Dispatcher['clone']>(async () => repository)
      const dispatcher = {
        clone,
        closeFoldout: t.mock.fn(),
      } as unknown as Dispatcher
      const view = render(
        <CloneRepository
          dispatcher={dispatcher}
          onDismissed={t.mock.fn()}
          accounts={accounts}
          initialURL={url}
          selectedTab={CloneRepositoryTab.Generic}
          onTabSelected={t.mock.fn()}
          apiRepositories={new Map()}
          onRefreshRepositories={t.mock.fn()}
          isTopMost={true}
        />
      )
      assert.equal(view.container.querySelectorAll('[role="tab"]').length, 2)
      const form = view.container.querySelector('form')
      assert.ok(form)
      await waitFor(() =>
        assert.strictEqual(
          screen
            .getByRole('button', { name: 'Clone', hidden: true })
            .getAttribute('aria-disabled'),
          null
        )
      )
      fireEvent.submit(form)
      const picker = await screen.findByRole('combobox', {
        name: 'Account',
        hidden: true,
      })
      assert.strictEqual(clone.mock.callCount(), 0)
      fireEvent.change(picker, { target: { value: '1' } })
      await waitFor(() => assert.strictEqual(clone.mock.callCount(), 1))
      assert.strictEqual(clone.mock.calls[0].arguments[0], url)
      assert.strictEqual(clone.mock.calls[0].arguments[3], accounts[1])
    })
  })
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
      null,
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
