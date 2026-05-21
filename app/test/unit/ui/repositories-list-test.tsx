import assert from 'node:assert'
import { describe, it, mock } from 'node:test'
import * as React from 'react'

import {
  Repository,
  ILocalRepositoryState,
} from '../../../src/models/repository'
import type { Dispatcher } from '../../../src/ui/dispatcher'
import { render, fireEvent, screen, waitFor } from '../../helpers/ui/render'

mock.module('../../../src/lib/menu-item', {
  namedExports: {
    showContextualMenu: async () => null,
  },
})
mock.module('../../../src/ui/main-process-proxy', {
  namedExports: {
    invokeContextualMenu: async () => null,
  },
})
mock.module('../../../src/ui/lib/update-store', {
  namedExports: {
    lastShowCaseVersionSeen: 'version-of-last-showcase',
    UpdateStatus: {
      UpdateNotChecked: 'UpdateNotChecked',
      CheckingForUpdates: 'CheckingForUpdates',
      UpdateAvailable: 'UpdateAvailable',
      UpdateNotAvailable: 'UpdateNotAvailable',
      UpdateReady: 'UpdateReady',
    },
    updateStore: {
      state: { status: 'UpdateNotChecked' },
      onDidChange: () => ({ dispose: () => {} }),
    },
  },
})

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  },
})

class TestResizeObserver {
  public constructor(private readonly callback: ResizeObserverCallback) {}

  public observe(target: Element) {
    Object.defineProperty(target, 'offsetWidth', {
      configurable: true,
      value: 480,
    })
    Object.defineProperty(target, 'offsetHeight', {
      configurable: true,
      value: 320,
    })
    this.callback(
      [
        {
          target,
          contentRect: {
            width: 480,
            height: 320,
          } as DOMRectReadOnly,
        } as ResizeObserverEntry,
      ],
      this as unknown as ResizeObserver
    )
  }

  public unobserve() {}

  public disconnect() {}
}

Object.assign(window, { ResizeObserver: TestResizeObserver })

async function renderRepositoriesList(
  repositories: ReadonlyArray<Repository>,
  localRepositoryStateLookup: ReadonlyMap<number, ILocalRepositoryState>
) {
  const { RepositoriesList } = await import('../../../src/ui/repositories-list')
  const dispatcher = {
    recordRepoClicked: () => {},
    showPopup: () => {},
  } as unknown as Dispatcher

  function TestRepositoriesList() {
    const [
      showOnlyRepositoriesWithIndicators,
      setShowOnlyRepositoriesWithIndicators,
    ] = React.useState(false)
    const [showRepositoryList, setShowRepositoryList] = React.useState(true)

    return (
      <>
        <button onClick={() => setShowRepositoryList(show => !show)}>
          Toggle repository list
        </button>
        {showRepositoryList ? (
          <RepositoriesList
            selectedRepository={null}
            repositories={repositories}
            recentRepositories={[]}
            localRepositoryStateLookup={localRepositoryStateLookup}
            onSelectionChanged={() => {}}
            askForConfirmationOnRemoveRepository={false}
            onRemoveRepository={() => {}}
            onShowRepository={() => {}}
            onViewOnGitHub={() => {}}
            onOpenInShell={() => {}}
            onOpenInExternalEditor={() => {}}
            onFilterTextChanged={() => {}}
            filterText=""
            showOnlyRepositoriesWithIndicators={
              showOnlyRepositoriesWithIndicators
            }
            onShowOnlyRepositoriesWithIndicatorsChanged={
              setShowOnlyRepositoriesWithIndicators
            }
            dispatcher={dispatcher}
          />
        ) : null}
      </>
    )
  }

  return render(<TestRepositoriesList />)
}

describe('RepositoriesList', () => {
  it('filters to repositories with changes, pushes, or pulls', async () => {
    const cleanRepo = new Repository('/tmp/clean', 1, null, false)
    const changedRepo = new Repository('/tmp/changed', 2, null, false)
    const behindRepo = new Repository('/tmp/behind', 3, null, false)

    await renderRepositoriesList(
      [cleanRepo, changedRepo, behindRepo],
      new Map<number, ILocalRepositoryState>([
        [1, { aheadBehind: { ahead: 0, behind: 0 }, changedFilesCount: 0 }],
        [2, { aheadBehind: null, changedFilesCount: 1 }],
        [3, { aheadBehind: { ahead: 0, behind: 2 }, changedFilesCount: 0 }],
      ])
    )

    await waitFor(() => assert.ok(screen.getByText('clean')))
    assert.ok(screen.getByText('changed'))
    assert.ok(screen.getByText('behind'))

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Filter repositories with changes, pushes, or pulls',
      })
    )

    await waitFor(() => assert.equal(screen.queryByText('clean'), null))
    assert.ok(screen.getByText('changed'))
    assert.ok(screen.getByText('behind'))

    fireEvent.click(
      screen.getByRole('button', { name: 'Toggle repository list' })
    )
    assert.equal(screen.queryByText('changed'), null)

    fireEvent.click(
      screen.getByRole('button', { name: 'Toggle repository list' })
    )

    await waitFor(() => assert.ok(screen.getByText('changed')))
    assert.equal(screen.queryByText('clean'), null)
    assert.ok(screen.getByText('behind'))
  })
})
