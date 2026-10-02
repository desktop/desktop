import assert from 'node:assert'
import * as Path from 'path'
import { describe, it, TestContext } from 'node:test'
import * as React from 'react'

import { API, getDotComAPIEndpoint } from '../../../src/lib/api'
import { CloneRepositoryTab } from '../../../src/models/clone-repository-tab'
import { Account } from '../../../src/models/account'
import { Repository } from '../../../src/models/repository'
import { CloneRepository } from '../../../src/ui/clone-repository/clone-repository'
import type { Dispatcher } from '../../../src/ui/dispatcher'
import { setDefaultDir } from '../../../src/ui/lib/default-dir'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'
import { createMockAPI, createMockAPIRepository } from '../../helpers/mock-api'

const dotCom = new Account(
  'alice',
  getDotComAPIEndpoint(),
  'token',
  [],
  '',
  1,
  'Alice'
)
const enterprise = new Account(
  'bob',
  'https://enterprise.example.com/api/v3',
  'token',
  [],
  '',
  2,
  'Bob'
)

class TestResizeObserver implements ResizeObserver {
  public constructor(private readonly callback: ResizeObserverCallback) {}

  public observe(target: Element) {
    Object.defineProperty(target, 'offsetWidth', {
      configurable: true,
      value: 400,
    })
    Object.defineProperty(target, 'offsetHeight', {
      configurable: true,
      value: 400,
    })
    this.callback(
      [
        {
          target,
          contentRect: {
            x: 0,
            y: 0,
            width: 400,
            height: 400,
            top: 0,
            right: 400,
            bottom: 400,
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

async function renderClone(
  t: TestContext,
  accounts: ReadonlyArray<Account> = [dotCom, enterprise],
  initialURL: string | null = null,
  apiRepositories: React.ComponentProps<
    typeof CloneRepository
  >['apiRepositories'] = new Map(),
  selectedTab = CloneRepositoryTab.DotCom
) {
  const electron = await import('electron')
  const originalSend = electron.ipcRenderer.send
  const originalResizeObserver = window.ResizeObserver
  const originalGlobalResizeObserver = globalThis.ResizeObserver
  Object.assign(globalThis, { ResizeObserver: TestResizeObserver })
  Object.assign(window, { ResizeObserver: TestResizeObserver })
  electron.ipcRenderer.send = () => {}
  const oldDirectory = localStorage.getItem('last-clone-location')
  setDefaultDir(Path.join(process.cwd(), 'app', 'test', 'unit', 'ui'))
  t.after(() => {
    electron.ipcRenderer.send = originalSend
    Object.assign(window, { ResizeObserver: originalResizeObserver })
    Object.assign(globalThis, { ResizeObserver: originalGlobalResizeObserver })
    if (oldDirectory === null) {
      localStorage.removeItem('last-clone-location')
    } else {
      setDefaultDir(oldDirectory)
    }
  })

  const repository = new Repository(
    Path.join(process.cwd(), 'clone-test'),
    1,
    null,
    false
  )
  const clone = t.mock.fn<Dispatcher['clone']>(async () => repository)
  const setRepositoryAccount = t.mock.fn<Dispatcher['setRepositoryAccount']>()
  const dispatcher = {
    clone,
    setRepositoryAccount,
    closeFoldout: t.mock.fn<Dispatcher['closeFoldout']>(),
  } as unknown as Dispatcher
  const view = render(
    <CloneRepository
      dispatcher={dispatcher}
      onDismissed={t.mock.fn()}
      accounts={accounts}
      initialURL={initialURL}
      selectedTab={selectedTab}
      onTabSelected={t.mock.fn()}
      apiRepositories={apiRepositories}
      onRefreshRepositories={t.mock.fn()}
      isTopMost={true}
    />
  )
  return { ...view, clone, setRepositoryAccount, repository }
}

describe('Clone repositories across accounts', () => {
  it('shows one authenticated GitHub tab and a separate URL tab', async t => {
    await renderClone(t)
    assert.ok(screen.getByText('GitHub'))
    assert.ok(screen.getByText('URL'))
    assert.strictEqual(screen.queryByText('GitHub Enterprise'), null)
  })

  it('offers sign-in for GitHub.com and Enterprise when no accounts are signed in', async t => {
    const { container } = await renderClone(t, [])
    assert.ok(screen.getByText(/Sign in to your GitHub account/))
    assert.ok(container.querySelectorAll('.call-to-action').length > 0)
    assert.ok(screen.getByText(/Enterprise/))
  })

  it('uses the unified GitHub tab when an older Enterprise tab selection is restored', async t => {
    await renderClone(t, [], null, new Map(), CloneRepositoryTab.Enterprise)
    assert.ok(screen.getByText(/Sign in to your GitHub account/))
    assert.ok(screen.getByText(/Sign in to GitHub Enterprise/))
  })

  it('lists repositories belonging only to the selected account across hosts', async t => {
    const aliceRepo = createMockAPIRepository({ name: 'alice-only' })
    const bobRepo = createMockAPIRepository({
      name: 'bob-only',
      clone_url: 'https://enterprise.example.com/bob/bob-only.git',
      html_url: 'https://enterprise.example.com/bob/bob-only',
    })
    const { container } = await renderClone(
      t,
      [dotCom, enterprise],
      null,
      new Map([
        [dotCom, { repositories: [aliceRepo], loading: false }],
        [enterprise, { repositories: [bobRepo], loading: false }],
      ])
    )
    await waitFor(() => assert.ok(screen.getByText('octocat/alice-only')))
    fireEvent.click(
      screen.getByRole('button', { name: /Account/, hidden: true })
    )
    await waitFor(() =>
      assert.ok(container.querySelectorAll('.account-list-item').length > 1)
    )
    const bobItem = container.querySelectorAll('.account-list-item')[1]
    fireEvent.click(bobItem)
    await waitFor(() => assert.ok(screen.getByText('octocat/bob-only')))
    assert.strictEqual(
      container.querySelector('.clone-repository-list-item .name')?.textContent,
      'octocat/bob-only'
    )
    assert.strictEqual(screen.queryByText('octocat/alice-only'), null)
  })

  it('shows the second account repository list when both accounts share a host', async t => {
    const second = new Account(
      'charlie',
      getDotComAPIEndpoint(),
      'second-token',
      [],
      '',
      3,
      'Charlie'
    )
    const { container } = await renderClone(
      t,
      [dotCom, second],
      null,
      new Map([
        [
          dotCom,
          {
            repositories: [createMockAPIRepository({ name: 'alice-only' })],
            loading: false,
          },
        ],
        [
          second,
          {
            repositories: [createMockAPIRepository({ name: 'charlie-only' })],
            loading: false,
          },
        ],
      ])
    )
    await waitFor(() => assert.ok(screen.getByText('octocat/alice-only')))
    fireEvent.click(
      screen.getByRole('button', { name: /Account/, hidden: true })
    )
    await waitFor(() =>
      assert.ok(container.querySelectorAll('.account-list-item').length > 1)
    )
    fireEvent.click(container.querySelectorAll('.account-list-item')[1])
    await waitFor(() => assert.ok(screen.getByText('octocat/charlie-only')))
    assert.strictEqual(screen.queryByText('octocat/alice-only'), null)
  })

  it('does not keep a previous account repository selected when switching hosts', async t => {
    const aliceRepo = createMockAPIRepository({
      name: 'clone-test',
      clone_url: 'https://github.com/alice/clone-test.git',
    })
    const { container } = await renderClone(
      t,
      [dotCom, enterprise],
      null,
      new Map([
        [dotCom, { repositories: [aliceRepo], loading: false }],
        [enterprise, { repositories: [], loading: false }],
      ])
    )
    await waitFor(() => assert.ok(screen.getByText('octocat/clone-test')))
    fireEvent.mouseDown(screen.getByText('octocat/clone-test'))
    fireEvent.mouseUp(screen.getByText('octocat/clone-test'))
    await waitFor(() =>
      assert.strictEqual(
        screen
          .getByRole('button', { name: 'Clone', hidden: true })
          .getAttribute('aria-disabled'),
        null
      )
    )
    fireEvent.click(
      screen.getByRole('button', { name: /Account/, hidden: true })
    )
    await waitFor(() =>
      assert.ok(container.querySelectorAll('.account-list-item').length > 1)
    )
    fireEvent.click(container.querySelectorAll('.account-list-item')[1])
    assert.strictEqual(
      screen
        .getByRole('button', { name: 'Clone', hidden: true })
        .getAttribute('aria-disabled'),
      'true'
    )
  })

  it('clones a selected enterprise repository over HTTPS and associates its account', async t => {
    const bobRepo = createMockAPIRepository({
      name: 'clone-test',
      clone_url: 'https://enterprise.example.com/bob/clone-test.git',
      html_url: 'https://enterprise.example.com/bob/clone-test',
    })
    const api = createMockAPI({
      fetchRepositoryCloneInfo: async () => ({
        url: bobRepo.clone_url,
        defaultBranch: 'main',
      }),
    })
    t.mock.method(API, 'fromAccount', () => api)
    const { container, clone, setRepositoryAccount, repository } =
      await renderClone(
        t,
        [enterprise],
        null,
        new Map([[enterprise, { repositories: [bobRepo], loading: false }]])
      )
    await waitFor(() => assert.ok(screen.getByText('octocat/clone-test')))
    fireEvent.mouseDown(screen.getByText('octocat/clone-test'))
    fireEvent.mouseUp(screen.getByText('octocat/clone-test'))
    await waitFor(() =>
      assert.strictEqual(
        screen
          .getByRole('button', { name: 'Clone', hidden: true })
          .getAttribute('aria-disabled'),
        null
      )
    )
    const form = container.querySelector('form')
    assert.ok(form)
    fireEvent.submit(form)
    await waitFor(() =>
      assert.strictEqual(setRepositoryAccount.mock.callCount(), 1)
    )
    assert.strictEqual(clone.mock.calls[0].arguments[0], bobRepo.clone_url)
    assert.deepStrictEqual(clone.mock.calls[0].arguments[2]?.accountIdentity, {
      endpoint: enterprise.endpoint,
      id: enterprise.id,
    })
    assert.deepStrictEqual(setRepositoryAccount.mock.calls[0].arguments, [
      repository,
      enterprise,
    ])
  })

  it('preserves a URL clone and associates the sole signed-in account with access', async t => {
    const url = 'https://github.com/owner/clone-test.git'
    const api = createMockAPI({
      fetchRepository: async () => ({
        ...createMockAPIRepository(),
        parent: undefined,
      }),
      fetchRepositoryCloneInfo: async () => ({
        url,
        defaultBranch: 'main',
      }),
    })
    t.mock.method(API, 'fromAccount', () => api)
    const { container, clone, setRepositoryAccount, repository } =
      await renderClone(t, [dotCom], url, new Map(), CloneRepositoryTab.Generic)
    await waitFor(() =>
      assert.strictEqual(
        screen
          .getByRole('button', { name: 'Clone', hidden: true })
          .getAttribute('aria-disabled'),
        null
      )
    )
    const form = container.querySelector('form')
    assert.ok(form)
    fireEvent.submit(form)
    await waitFor(() =>
      assert.strictEqual(setRepositoryAccount.mock.callCount(), 1)
    )
    assert.strictEqual(clone.mock.calls[0].arguments[0], url)
    assert.deepStrictEqual(clone.mock.calls[0].arguments[2]?.accountIdentity, {
      endpoint: dotCom.endpoint,
      id: dotCom.id,
    })
    assert.deepStrictEqual(setRepositoryAccount.mock.calls[0].arguments, [
      repository,
      dotCom,
    ])
  })

  it('resolves a repository alias with its sole accessible account', async t => {
    const url = 'owner/clone-test'
    const cloneURL = 'https://enterprise.example.com/owner/clone-test.git'
    t.mock.method(API, 'fromAccount', (account: Account) =>
      createMockAPI({
        fetchRepository: async () =>
          account.id === enterprise.id
            ? { ...createMockAPIRepository(), parent: undefined }
            : null,
        fetchRepositoryCloneInfo: async () => ({
          url: cloneURL,
          defaultBranch: 'main',
        }),
      })
    )
    const { container, clone, setRepositoryAccount, repository } =
      await renderClone(
        t,
        [dotCom, enterprise],
        url,
        new Map(),
        CloneRepositoryTab.Generic
      )
    await waitFor(() =>
      assert.strictEqual(
        screen
          .getByRole('button', { name: 'Clone', hidden: true })
          .getAttribute('aria-disabled'),
        null
      )
    )
    const form = container.querySelector('form')
    assert.ok(form)
    fireEvent.submit(form)
    await waitFor(() =>
      assert.strictEqual(setRepositoryAccount.mock.callCount(), 1)
    )
    assert.strictEqual(clone.mock.calls[0].arguments[0], cloneURL)
    assert.deepStrictEqual(setRepositoryAccount.mock.calls[0].arguments, [
      repository,
      enterprise,
    ])
  })

  it('prompts for an account when multiple signed-in accounts can access a URL', async t => {
    const second = new Account(
      'charlie',
      getDotComAPIEndpoint(),
      'second-token',
      [],
      '',
      3,
      'Charlie'
    )
    const url = 'https://github.com/owner/clone-test.git'
    t.mock.method(API, 'fromAccount', () =>
      createMockAPI({
        fetchRepository: async () => ({
          ...createMockAPIRepository(),
          parent: undefined,
        }),
        fetchRepositoryCloneInfo: async () => ({ url }),
      })
    )
    const { container, clone, setRepositoryAccount, repository } =
      await renderClone(
        t,
        [dotCom, second],
        url,
        new Map(),
        CloneRepositoryTab.Generic
      )
    const form = container.querySelector('form')
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
    await waitFor(() =>
      assert.ok(screen.getByText(/Choose an account to clone/))
    )
    assert.strictEqual(clone.mock.callCount(), 0)
    fireEvent.click(
      screen.getByRole('button', { name: /charlie.*GitHub.com/i, hidden: true })
    )
    fireEvent.submit(form)
    await waitFor(() =>
      assert.strictEqual(setRepositoryAccount.mock.callCount(), 1)
    )
    assert.strictEqual(clone.mock.calls[0].arguments[0], url)
    assert.deepStrictEqual(setRepositoryAccount.mock.calls[0].arguments, [
      repository,
      second,
    ])
  })

  it('resolves an alias using the account chosen for an ambiguous repository', async t => {
    const second = new Account(
      'charlie',
      getDotComAPIEndpoint(),
      'second-token',
      [],
      '',
      3,
      'Charlie'
    )
    t.mock.method(API, 'fromAccount', (account: Account) =>
      createMockAPI({
        fetchRepository: async () => ({
          ...createMockAPIRepository(),
          parent: undefined,
        }),
        fetchRepositoryCloneInfo: async () => ({
          url: `https://github.com/${account.login}/clone-test.git`,
        }),
      })
    )
    const { container, clone, setRepositoryAccount } = await renderClone(
      t,
      [dotCom, second],
      'owner/clone-test',
      new Map(),
      CloneRepositoryTab.Generic
    )
    const form = container.querySelector('form')
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
    await waitFor(() =>
      assert.ok(screen.getByText(/Choose an account to clone/))
    )
    fireEvent.click(
      screen.getByRole('button', { name: /alice.*GitHub.com/i, hidden: true })
    )
    fireEvent.submit(form)
    await waitFor(() =>
      assert.strictEqual(setRepositoryAccount.mock.callCount(), 1)
    )
    assert.strictEqual(
      clone.mock.calls[0].arguments[0],
      'https://github.com/alice/clone-test.git'
    )
  })

  it('refuses an HTTPS clone when the signed-in account cannot access it', async t => {
    const url = 'https://github.com/owner/clone-test.git'
    t.mock.method(API, 'fromAccount', () =>
      createMockAPI({
        fetchRepository: async () => null,
        fetchRepositoryCloneInfo: async () => ({ url }),
      })
    )
    const { container, clone } = await renderClone(
      t,
      [dotCom],
      url,
      new Map(),
      CloneRepositoryTab.Generic
    )
    await waitFor(() =>
      assert.strictEqual(
        screen
          .getByRole('button', { name: 'Clone', hidden: true })
          .getAttribute('aria-disabled'),
        null
      )
    )
    const form = container.querySelector('form')
    assert.ok(form)
    fireEvent.submit(form)
    await waitFor(() =>
      assert.ok(screen.getByText(/couldn't find that repository/i))
    )
    assert.strictEqual(clone.mock.callCount(), 0)
  })

  it('lets Git determine whether an unmatched HTTPS URL is public or inaccessible', async t => {
    const url = 'https://github.com/owner/clone-test.git'
    t.mock.method(API, 'fromAccount', () =>
      createMockAPI({
        fetchRepositoryCloneInfo: async () => ({ url }),
      })
    )
    const { container, clone, setRepositoryAccount, repository } =
      await renderClone(t, [], url, new Map(), CloneRepositoryTab.Generic)
    await waitFor(() =>
      assert.strictEqual(
        screen
          .getByRole('button', { name: 'Clone', hidden: true })
          .getAttribute('aria-disabled'),
        null
      )
    )
    const form = container.querySelector('form')
    assert.ok(form)
    fireEvent.submit(form)
    await waitFor(() => assert.strictEqual(clone.mock.callCount(), 1))
    assert.strictEqual(clone.mock.calls[0].arguments[0], url)
    await waitFor(() =>
      assert.strictEqual(setRepositoryAccount.mock.callCount(), 1)
    )
    assert.deepStrictEqual(setRepositoryAccount.mock.calls[0].arguments, [
      repository,
      null,
    ])
  })

  it('preserves an unmatched SSH URL and leaves its clone unassociated', async t => {
    const url = 'git@github.com:owner/clone-test.git'
    t.mock.method(API, 'fromAccount', () =>
      createMockAPI({
        fetchRepository: async () => ({
          ...createMockAPIRepository(),
          parent: undefined,
        }),
        fetchRepositoryCloneInfo: async () => ({
          url: 'https://github.com/owner/clone-test.git',
        }),
      })
    )
    const { container, clone, setRepositoryAccount, repository } =
      await renderClone(
        t,
        [enterprise],
        url,
        new Map(),
        CloneRepositoryTab.Generic
      )
    await waitFor(() =>
      assert.strictEqual(
        screen
          .getByRole('button', { name: 'Clone', hidden: true })
          .getAttribute('aria-disabled'),
        null
      )
    )
    const form = container.querySelector('form')
    assert.ok(form)
    fireEvent.submit(form)
    await waitFor(() =>
      assert.strictEqual(setRepositoryAccount.mock.callCount(), 1)
    )
    assert.strictEqual(clone.mock.calls[0].arguments[0], url)
    assert.deepStrictEqual(setRepositoryAccount.mock.calls[0].arguments, [
      repository,
      null,
    ])
  })
})
