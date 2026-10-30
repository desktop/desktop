import assert from 'node:assert'
import { describe, it, TestContext } from 'node:test'
import * as React from 'react'

import { API } from '../../../src/lib/api'
import { Account } from '../../../src/models/account'
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
  assert.strictEqual(selectedLogin(container), '@alice')
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

    const selectedTab = view.container.querySelector('.tab-bar-item.selected')
    assert.strictEqual(selectedTab?.textContent, 'GitHub Enterprise')
    assert.strictEqual(selectedLogin(view.container), '@bob')
  })

  it('clones with the selected account', async t => {
    await setup(t)
    setDefaultDir(await createTempDirectory(t))
    const clone = t.mock.fn<Dispatcher['clone']>()
    const dispatcher: Pick<Dispatcher, 'clone' | 'closeFoldout'> = {
      clone,
      closeFoldout: t.mock.fn<Dispatcher['closeFoldout']>(),
    }
    const repository = createMockAPIRepository({
      name: 'repo',
      clone_url: 'https://github.com/bob/repo.git',
      html_url: 'https://github.com/bob/repo',
      owner: createMockAPIIdentity({ login: 'bob' }),
    })
    const view = render(
      <CloneRepository
        dispatcher={dispatcher as Dispatcher}
        onDismissed={t.mock.fn()}
        accounts={[alice, bob]}
        initialURL={null}
        selectedTab={CloneRepositoryTab.DotCom}
        onTabSelected={t.mock.fn()}
        apiRepositories={
          new Map([
            [alice, { repositories: [], loading: false }],
            [bob, { repositories: [repository], loading: false }],
          ])
        }
        onRefreshRepositories={t.mock.fn()}
        isTopMost={true}
      />
    )

    await selectAccount(view.container, bob)
    const item = await waitFor(() =>
      screen.getByRole('option', { name: /bob\/repo/, hidden: true })
    )
    fireEvent.click(item)
    const cloneButton = screen.getByRole('button', {
      name: 'Clone',
      hidden: true,
    })
    await waitFor(() =>
      assert.strictEqual(cloneButton.hasAttribute('disabled'), false)
    )
    const form = view.container.querySelector('form')
    assert.ok(form)
    fireEvent.submit(form)

    await waitFor(() => assert.strictEqual(clone.mock.callCount(), 1))
    assert.deepStrictEqual(clone.mock.calls[0].arguments[2], {
      defaultBranch: undefined,
      account: { endpoint, login: 'bob' },
    })
  })
})
