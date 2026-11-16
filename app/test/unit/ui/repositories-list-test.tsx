import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as React from 'react'
import { render, screen, waitFor } from '../../helpers/ui/render'
import { RepositoriesList } from '../../../src/ui/repositories-list/repositories-list'
import { Repository } from '../../../src/models/repository'
import { Account } from '../../../src/models/account'
import { gitHubRepoFixture } from '../../helpers/github-repo-builder'
import { createMockDispatcher } from '../../helpers/mock-dispatcher'

class ListResizeObserver implements ResizeObserver {
  public constructor(private readonly callback: ResizeObserverCallback) {}

  public observe(target: Element) {
    Object.defineProperties(target, {
      offsetWidth: { configurable: true, value: 500 },
      offsetHeight: { configurable: true, value: 700 },
    })
    this.callback(
      [
        {
          target,
          contentRect: new DOMRect(0, 0, 500, 700),
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

function repository(id: number, login: string | null, endpoint: string | null) {
  return new Repository(
    `/repo-${id}`,
    id,
    endpoint === null
      ? null
      : gitHubRepoFixture({ owner: 'acme', name: `repo-${id}`, endpoint }),
    false,
    null,
    undefined,
    false,
    undefined,
    undefined,
    login
  )
}

function props(
  repositories: ReadonlyArray<Repository>,
  accounts: ReadonlyArray<Account>
): React.ComponentProps<typeof RepositoriesList> {
  return {
    repositories,
    accounts,
    selectedRepository: null,
    recentRepositories: [],
    localRepositoryStateLookup: new Map(),
    onSelectionChanged: () => {},
    askForConfirmationOnRemoveRepository: false,
    onRemoveRepository: () => {},
    onShowRepository: () => {},
    onViewOnGitHub: () => {},
    onOpenInShell: () => {},
    onOpenInExternalEditor: () => {},
    onFilterTextChanged: () => {},
    filterText: '',
    onChangeRepositoryAccount: () => {},
    onShowRepositorySettings: () => {},
    dispatcher: createMockDispatcher({}),
  }
}

describe('RepositoriesList account groups', () => {
  const endpoint = 'https://api.github.com'
  const alice = new Account('alice', endpoint, '', [], '', 1, '')
  const bob = new Account('bob', endpoint, '', [], '', 2, '')
  const originalResizeObserver = window.ResizeObserver

  beforeEach(() => {
    window.ResizeObserver = ListResizeObserver
  })

  afterEach(() => {
    window.ResizeObserver = originalResizeObserver
  })

  it('updates headings when accounts change without changing the repository list', async () => {
    const repositories = [
      repository(1, 'alice', endpoint),
      repository(2, null, endpoint),
    ]
    const initial = props(repositories, [alice])
    const view = render(<RepositoriesList {...initial} />)

    await waitFor(() => assert.ok(screen.getByText('acme')))
    view.rerender(<RepositoriesList {...initial} accounts={[alice, bob]} />)

    await waitFor(() => {
      assert.ok(screen.getByText('acme \u2014 @alice'))
      assert.ok(screen.getByText('acme \u2014 Unassociated'))
      assert.equal(screen.queryByText('acme'), null)
    })

    view.rerender(<RepositoriesList {...initial} />)
    await waitFor(() => assert.ok(screen.getByText('acme')))
  })

  it('renders signed-out, enterprise and local-only account headings and updates after reassignment', async () => {
    const enterpriseEndpoint = 'https://ghe.example/api/v3'
    const repositories = [
      repository(1, 'alice', enterpriseEndpoint),
      repository(2, 'bob', enterpriseEndpoint),
      repository(3, 'alice', null),
      repository(4, 'bob', null),
      repository(5, null, null),
    ]
    const initial = props(repositories, [])
    const view = render(<RepositoriesList {...initial} />)

    await waitFor(() => {
      assert.ok(screen.getByText('ghe.example \u2014 @alice'))
      assert.ok(screen.getByText('ghe.example \u2014 @bob'))
      assert.ok(screen.getByText('Other \u2014 @alice'))
      assert.ok(screen.getByText('Other \u2014 @bob'))
      assert.ok(screen.getByText('Other'))
    })

    view.rerender(
      <RepositoriesList
        {...initial}
        repositories={[
          repository(1, 'bob', enterpriseEndpoint),
          ...repositories.slice(1),
        ]}
      />
    )

    await waitFor(() => {
      assert.ok(screen.getByText('ghe.example'))
      assert.equal(screen.queryByText('ghe.example \u2014 @alice'), null)
      assert.equal(screen.queryByText('ghe.example \u2014 @bob'), null)
    })
  })
})
