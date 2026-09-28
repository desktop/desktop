import { render, screen, fireEvent, waitFor } from '../../helpers/ui/render'
import { act } from 'react-dom/test-utils'
import * as Path from 'path'
import * as React from 'react'
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { Account } from '../../../src/models/account'
import { RepositoryAccount } from '../../../src/ui/repository-settings/repository-account'
import { Remote } from '../../../src/ui/repository-settings/remote'
import { Accounts } from '../../../src/ui/preferences/accounts'
import { CloneRepository } from '../../../src/ui/clone-repository/clone-repository'
import { CloneRepositoryTab } from '../../../src/models/clone-repository-tab'
import type { Dispatcher } from '../../../src/ui/dispatcher'
import { API } from '../../../src/lib/api'
import { setDefaultDir } from '../../../src/ui/lib/default-dir'
import { createTempDirectory } from '../../helpers/temp'
import { createMockAPI, createMockAPIRepository } from '../../helpers/mock-api'

const endpoint = 'https://api.github.com'
const work = new Account(
  'work',
  endpoint,
  'fake-work-token',
  [],
  '',
  1,
  'Work',
  'free'
)
const personal = new Account(
  'personal',
  endpoint,
  'fake-personal-token',
  [],
  '',
  2,
  'Personal',
  'free'
)

describe('repository account selection UI', () => {
  const channel = __RELEASE_CHANNEL__
  beforeEach(() => {
    Object.defineProperty(globalThis, '__RELEASE_CHANNEL__', {
      value: 'custom',
      configurable: true,
    })
  })
  afterEach(() => {
    Object.defineProperty(globalThis, '__RELEASE_CHANNEL__', {
      value: channel,
      configurable: true,
    })
  })

  it('selects a signed-in account and can restore the host default', () => {
    const changes: Array<Account | null> = []
    render(
      <RepositoryAccount
        accounts={[work, personal]}
        remoteURL="https://github.com/owner/repo"
        binding={null}
        onChange={account => changes.push(account)}
      />
    )
    const select = screen.getByLabelText('GitHub account for this repository')
    fireEvent.change(select, {
      target: { value: JSON.stringify([endpoint, 2]) },
    })
    fireEvent.change(select, { target: { value: '' } })
    assert.deepEqual(changes, [personal, null])
    assert.ok(screen.getByText(/not the commit name or email/))
  })

  it('keeps a missing binding visible instead of selecting another account', () => {
    render(
      <RepositoryAccount
        accounts={[work]}
        remoteURL="https://github.com/owner/repo"
        binding={{ endpoint, id: 2, login: 'personal' }}
        onChange={() => {}}
      />
    )
    assert.ok(
      screen
        .getByRole('alert')
        .textContent?.includes('will not be used automatically')
    )
    assert.ok(
      screen.getByRole('option', { name: '@personal (sign-in required)' })
    )
  })

  it('does not offer GitHub identities for Azure DevOps', () => {
    render(
      <RepositoryAccount
        accounts={[work, personal]}
        remoteURL="https://gnaudio.visualstudio.com/JabraSDK-v2/_git/jabra-node-sdk"
        binding={null}
        onChange={() => {}}
      />
    )
    assert.equal(screen.queryByRole('option', { name: '@personal' }), null)
    assert.ok(screen.getByText(/Azure DevOps/))
  })

  it('warns that SSH keys control SSH authentication', () => {
    render(
      <RepositoryAccount
        accounts={[work]}
        remoteURL="git@github.com:owner/repo.git"
        binding={null}
        onChange={() => {}}
      />
    )
    assert.ok(screen.getByRole('status').textContent?.includes('SSH key'))
  })

  it('keeps the remote URL and account selection in a single dialog content panel', () => {
    const url = 'https://github.com/owner/repo'
    const view = render(
      <Remote remote={{ name: 'origin', url }} onRemoteUrlChanged={() => {}}>
        <RepositoryAccount
          accounts={[work, personal]}
          remoteURL={url}
          binding={null}
          onChange={() => {}}
        />
      </Remote>
    )
    assert.equal(view.container.querySelectorAll('.dialog-content').length, 1)
    assert.ok(screen.getByLabelText('GitHub account for this repository'))
  })

  it('shows both GitHub.com accounts and offers another sign-in', () => {
    let signIns = 0
    const signedOut: Account[] = []
    render(
      <Accounts
        accounts={[work, personal]}
        onDotComSignIn={() => signIns++}
        onEnterpriseSignIn={() => {}}
        onLogout={account => signedOut.push(account)}
      />
    )
    assert.ok(screen.getByText('@work'))
    assert.ok(screen.getByText('@personal'))
    fireEvent.click(
      screen.getByRole('button', { name: 'Add GitHub.com account' })
    )
    assert.equal(signIns, 1)
    fireEvent.click(screen.getAllByRole('button', { name: /Sign out/i })[1])
    assert.deepEqual(signedOut, [personal])
  })

  it('clones with the second same-host account and saves its binding before Git starts', async t => {
    const originalResizeObserver = window.ResizeObserver
    Object.assign(window, { ResizeObserver: globalThis.ResizeObserver })
    const electron = await import('electron')
    const originalSend = electron.ipcRenderer.send
    electron.ipcRenderer.send = () => {}
    const oldDefault = localStorage.getItem('last-clone-location')
    t.after(() => {
      Object.assign(window, { ResizeObserver: originalResizeObserver })
      electron.ipcRenderer.send = originalSend
      if (oldDefault === null) {
        localStorage.removeItem('last-clone-location')
      } else {
        setDefaultDir(oldDefault)
      }
    })
    const directory = await createTempDirectory(t)
    setDefaultDir(directory)
    const repository = createMockAPIRepository({
      name: 'personal-only',
      clone_url: 'https://github.com/octocat/personal-only.git',
    })
    const api = createMockAPI({
      fetchRepositoryCloneInfo: async () => ({
        url: repository.clone_url,
        defaultBranch: 'main',
      }),
    })
    t.mock.method(API, 'fromAccount', (account: Account) => {
      assert.equal(account, personal)
      return api
    })
    const bindings: Array<readonly unknown[]> = []
    const clone = t.mock.fn<Dispatcher['clone']>(() => {
      assert.deepEqual(bindings, [[null, repository.clone_url, personal]])
      return Promise.resolve(null)
    })
    const dispatcher: Pick<
      Dispatcher,
      'clone' | 'closeFoldout' | 'setRepositoryAccount'
    > = {
      clone,
      closeFoldout: async () => {},
      setRepositoryAccount: async (...args) => {
        bindings.push(args)
      },
    }
    const ref = React.createRef<CloneRepository>()
    const view = render(
      <CloneRepository
        ref={ref}
        dispatcher={dispatcher as Dispatcher}
        onDismissed={() => {}}
        accounts={[work, personal]}
        initialURL={null}
        selectedTab={CloneRepositoryTab.DotCom}
        onTabSelected={() => {}}
        apiRepositories={
          new Map([
            [work, { loading: false, repositories: [] }],
            [personal, { loading: false, repositories: [repository] }],
          ])
        }
        onRefreshRepositories={() => {}}
        isTopMost={true}
      />
    )
    const component = ref.current
    assert.ok(component)
    // Populate selection state independently of virtual-list layout in JSDOM.
    act(() =>
      component.setState({
        dotComTabState: {
          ...component.state.dotComTabState,
          selectedAccount: personal,
          selectedItem: repository,
          url: repository.clone_url,
          lastParsedIdentifier: {
            hostname: 'github.com',
            owner: 'octocat',
            name: 'personal-only',
          },
          path: Path.join(directory, 'personal-only'),
        },
      })
    )
    assert.equal(
      view.container.querySelector('.account-picker .login')?.textContent,
      '@personal'
    )
    const form = view.container.querySelector('form')
    assert.ok(form)
    fireEvent.submit(form)
    await waitFor(() => assert.equal(clone.mock.callCount(), 1))
  })
})
