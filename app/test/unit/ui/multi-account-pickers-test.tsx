import assert from 'node:assert'
import { describe, it, TestContext } from 'node:test'
import * as React from 'react'

import { API } from '../../../src/lib/api'
import { Account, IAccountIdentity } from '../../../src/models/account'
import { IAccountRepositories } from '../../../src/lib/stores/api-repositories-store'
import { CloneRepositoryTab } from '../../../src/models/clone-repository-tab'
import { Repository } from '../../../src/models/repository'
import { CloneRepository } from '../../../src/ui/clone-repository/clone-repository'
import type { Dispatcher } from '../../../src/ui/dispatcher'
import { Publish } from '../../../src/ui/publish-repository/publish'
import { setDefaultDir } from '../../../src/ui/lib/default-dir'
import {
  createMockAPI,
  createMockAPIIdentity,
  createMockAPIRepository,
} from '../../helpers/mock-api'
import { gitHubRepoFixture } from '../../helpers/github-repo-builder'
import { createTempDirectory } from '../../helpers/temp'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

const endpoint = 'https://api.github.com'
const alice = new Account('alice', endpoint, 'alice-token', [], '', 1, '')
const bob = new Account('bob', endpoint, 'bob-token', [], '', 2, '')

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

async function setup(t: TestContext) {
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
  t.mock.method(API, 'fromAccount', () =>
    createMockAPI({ fetchOrgs: async () => [] })
  )
}

function selectedLogin(container: HTMLElement) {
  return container.querySelector('.account-picker .login')?.textContent
}

/** Pick an account in the account picker, then wait for it to be shown. */
async function selectAccount(container: HTMLElement, account: Account) {
  fireEvent.click(screen.getByRole('button', { name: 'Account', hidden: true }))
  const item = await waitFor(() =>
    screen.getByRole('option', {
      name: new RegExp(`@${account.login}`),
      hidden: true,
    })
  )
  fireEvent.click(item)
  await waitFor(() =>
    assert.strictEqual(selectedLogin(container), `@${account.login}`)
  )
}

describe('account pickers with multiple accounts on one endpoint', () => {
  it('publishes with the selected account', async t => {
    await setup(t)
    const publishRepository = t.mock.fn<Dispatcher['publishRepository']>(
      async repository => repository
    )
    const dispatcher: Pick<Dispatcher, 'publishRepository'> = {
      publishRepository,
    }
    const view = render(
      <Publish
        dispatcher={dispatcher as Dispatcher}
        repository={new Repository('/does-not-exist', 1, null, false)}
        accounts={[alice, bob]}
        onDismissed={t.mock.fn()}
      />
    )

    await selectAccount(view.container, bob)
    const form = view.container.querySelector('form')
    assert.ok(form)
    fireEvent.submit(form)

    await waitFor(() =>
      assert.strictEqual(publishRepository.mock.callCount(), 1)
    )
    assert.strictEqual(publishRepository.mock.calls[0].arguments[4], bob)
  })

  it("selects the repository's assigned account when publishing", async t => {
    await setup(t)
    const enterpriseEndpoint = 'https://ghe.example.com/api/v3'
    const enterpriseAlice = new Account(
      'alice',
      enterpriseEndpoint,
      'ghe-token',
      [],
      '',
      3,
      ''
    )
    const enterpriseBob = new Account(
      'bob',
      enterpriseEndpoint,
      'ghe-bob-token',
      [],
      '',
      4,
      ''
    )
    const gitHubRepository = gitHubRepoFixture({
      owner: 'bob',
      name: 'repo',
      endpoint: enterpriseEndpoint,
    })
    const view = render(
      <Publish
        dispatcher={{} as Dispatcher}
        repository={
          new Repository(
            '/does-not-exist',
            1,
            gitHubRepository,
            false,
            null,
            {},
            false,
            undefined,
            undefined,
            'BOB'
          )
        }
        accounts={[alice, bob, enterpriseAlice, enterpriseBob]}
        onDismissed={t.mock.fn()}
      />
    )

    assert.strictEqual(view.container.querySelector('.tab-bar'), null)
    assert.strictEqual(selectedLogin(view.container), '@bob')
    assert.strictEqual(
      view.container.querySelector('.account-picker .endpoint')?.textContent,
      'ghe.example.com'
    )
  })
})

const enterpriseEndpoint = 'https://ghe.example.com/api/v3'
const enterpriseCarol = new Account(
  'carol',
  enterpriseEndpoint,
  'carol-token',
  [],
  '',
  3,
  ''
)

interface ICloneHarnessProps {
  readonly accounts: ReadonlyArray<Account>
  readonly apiRepositories: ReadonlyMap<Account, IAccountRepositories>
  readonly dispatcher: Dispatcher
  readonly initialAccount?: IAccountIdentity
}

interface ICloneHarnessState {
  readonly selectedTab: CloneRepositoryTab
  readonly selectedAccount: IAccountIdentity | null
}

/** Keeps the tab and account selection the way AppStore does. */
class CloneHarness extends React.Component<
  ICloneHarnessProps,
  ICloneHarnessState
> {
  public constructor(props: ICloneHarnessProps) {
    super(props)
    this.state = {
      selectedTab: CloneRepositoryTab.GitHub,
      selectedAccount: props.initialAccount ?? null,
    }
  }

  public render() {
    const dispatcher = {
      ...this.props.dispatcher,
      changeCloneRepositoriesAccount: (account: IAccountIdentity) => {
        this.props.dispatcher.changeCloneRepositoriesAccount(account)
        this.setState({ selectedAccount: account })
      },
    }
    return (
      <CloneRepository
        dispatcher={dispatcher as Dispatcher}
        onDismissed={() => {}}
        accounts={this.props.accounts}
        initialURL={null}
        selectedTab={this.state.selectedTab}
        onTabSelected={selectedTab => this.setState({ selectedTab })}
        selectedAccount={this.state.selectedAccount}
        apiRepositories={this.props.apiRepositories}
        onRefreshRepositories={() => {}}
        isTopMost={true}
      />
    )
  }
}

async function renderClone(
  t: TestContext,
  props: Omit<ICloneHarnessProps, 'dispatcher'>
) {
  await setup(t)
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
  const view = render(
    <CloneHarness {...props} dispatcher={dispatcher as Dispatcher} />
  )
  return { view, clone, changeCloneRepositoriesAccount }
}

/** Select a repository the way a mouse does: on mouse down. */
function clickRepository(item: HTMLElement) {
  fireEvent.mouseDown(item)
  fireEvent.mouseUp(item)
  fireEvent.click(item)
}

function repositoryFor(owner: string, name: string, host = 'github.com') {
  return createMockAPIRepository({
    name,
    clone_url: `https://${host}/${owner}/${name}.git`,
    ssh_url: `git@${host}:${owner}/${name}.git`,
    html_url: `https://${host}/${owner}/${name}`,
    owner: createMockAPIIdentity({ login: owner }),
  })
}

describe('Clone Repository across accounts', () => {
  it('shows one GitHub tab with an account picker and a URL tab', async t => {
    const { view } = await renderClone(t, {
      accounts: [enterpriseCarol, alice],
      apiRepositories: new Map(),
    })

    const tabs = screen
      .getAllByRole('tab', { hidden: true })
      .map(tab => tab.textContent)
    assert.deepStrictEqual(tabs, ['GitHub', 'URL'])
    // GitHub.com accounts come first in the picker, so they're the default.
    assert.strictEqual(selectedLogin(view.container), '@alice')

    fireEvent.click(
      screen.getByRole('button', { name: 'Account', hidden: true })
    )
    const headers = await waitFor(() => {
      const headers = [
        ...document.querySelectorAll('.account-list .filter-list-group-header'),
      ].map(h => h.textContent)
      assert.notStrictEqual(headers.length, 0)
      return headers
    })
    assert.deepStrictEqual(headers, ['GitHub.com', 'ghe.example.com'])
  })

  it('starts out on the account last picked in this session', async t => {
    const { view } = await renderClone(t, {
      accounts: [alice, enterpriseCarol],
      apiRepositories: new Map(),
      initialAccount: { endpoint: enterpriseEndpoint, login: 'carol' },
    })
    assert.strictEqual(selectedLogin(view.container), '@carol')
  })

  it('falls back to the first account when the picked one signed out', async t => {
    const { view } = await renderClone(t, {
      accounts: [alice, enterpriseCarol],
      apiRepositories: new Map(),
      initialAccount: { endpoint, login: 'bob' },
    })
    assert.strictEqual(selectedLogin(view.container), '@alice')
  })

  it('offers to sign in when no account is signed in', async t => {
    const { view } = await renderClone(t, {
      accounts: [],
      apiRepositories: new Map(),
    })
    assert.strictEqual(view.container.querySelector('.account-picker'), null)
    screen.getByRole('button', { name: /^Sign in$/i, hidden: true })
    screen.getByRole('button', {
      name: /Sign in to GitHub Enterprise/i,
      hidden: true,
    })
  })

  it('lists repositories for the selected account and clones with it over HTTPS', async t => {
    const aliceRepository = repositoryFor('alice', 'alice-repo')
    const carolRepository = repositoryFor('carol', 'repo', 'ghe.example.com')
    const { view, clone, changeCloneRepositoriesAccount } = await renderClone(
      t,
      {
        accounts: [alice, bob, enterpriseCarol],
        apiRepositories: new Map([
          [alice, { repositories: [aliceRepository], loading: false }],
          [bob, { repositories: [], loading: false }],
          [
            enterpriseCarol,
            { repositories: [carolRepository], loading: false },
          ],
        ]),
      }
    )

    await waitFor(() =>
      screen.getByRole('option', { name: /alice\/alice-repo/, hidden: true })
    )
    await selectAccount(view.container, enterpriseCarol)
    assert.deepStrictEqual(
      changeCloneRepositoriesAccount.mock.calls.map(c => c.arguments[0]),
      [enterpriseCarol]
    )
    const item = await waitFor(() =>
      screen.getByRole('option', { name: /carol\/repo/, hidden: true })
    )
    assert.strictEqual(
      screen.queryByRole('option', { name: /alice-repo/, hidden: true }),
      null
    )
    clickRepository(item)
    const cloneButton = screen.getByRole('button', {
      name: 'Clone',
      hidden: true,
    })
    await waitFor(() =>
      assert.strictEqual(cloneButton.getAttribute('aria-disabled'), null)
    )
    const form = view.container.querySelector('form')
    assert.ok(form)
    fireEvent.submit(form)

    await waitFor(() => assert.strictEqual(clone.mock.callCount(), 1))
    const [url, , options] = clone.mock.calls[0].arguments
    assert.strictEqual(url, 'https://ghe.example.com/carol/repo.git')
    assert.deepStrictEqual(options, {
      defaultBranch: undefined,
      account: { endpoint: enterpriseEndpoint, login: 'carol' },
    })
  })

  it('clears the selected repository when switching accounts', async t => {
    const aliceRepository = repositoryFor('alice', 'alice-repo')
    const { view } = await renderClone(t, {
      accounts: [alice, bob],
      apiRepositories: new Map([
        [alice, { repositories: [aliceRepository], loading: false }],
        [bob, { repositories: [aliceRepository], loading: false }],
      ]),
    })

    const item = await waitFor(() =>
      screen.getByRole('option', { name: /alice\/alice-repo/, hidden: true })
    )
    clickRepository(item)
    const cloneButton = screen.getByRole('button', {
      name: 'Clone',
      hidden: true,
    })
    await waitFor(() =>
      assert.strictEqual(cloneButton.getAttribute('aria-disabled'), null)
    )

    await selectAccount(view.container, bob)
    await waitFor(() =>
      assert.strictEqual(cloneButton.getAttribute('aria-disabled'), 'true')
    )
  })
})
