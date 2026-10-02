import assert from 'node:assert'
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test'
import * as React from 'react'
import { act } from 'react-dom/test-utils'

import type { AheadBehindStore } from '../../../src/lib/stores/ahead-behind-store'
import type { IRepositoryState } from '../../../src/lib/app-state'
import { Branch, BranchType, IAheadBehind } from '../../../src/models/branch'
import { GitHubRepository } from '../../../src/models/github-repository'
import type { IMenu } from '../../../src/models/app-menu'
import { Owner } from '../../../src/models/owner'
import { Repository } from '../../../src/models/repository'
import { TipState } from '../../../src/models/tip'
import type { Dispatcher } from '../../../src/ui/dispatcher'
import { render } from '../../helpers/ui/render'
import { enableTestTimers, resetTestTimers } from '../../helpers/ui/timers'

interface IDropdownSuggestedActionStubProps {
  readonly className?: string
}

mock.module('../../../src/ui/suggested-actions/dropdown-suggested-action', {
  namedExports: {
    DropdownSuggestedAction: ({
      className,
    }: IDropdownSuggestedActionStubProps) => <div className={className} />,
  },
})

let NoChanges: typeof import('../../../src/ui/changes/no-changes').NoChanges

before(async () => {
  NoChanges = (await import('../../../src/ui/changes/no-changes')).NoChanges
})

beforeEach(() => enableTestTimers(['setTimeout']))
afterEach(() => resetTestTimers())

interface IAheadBehindRequest {
  readonly from: string
  readonly to: string
  readonly callback: (aheadBehind: IAheadBehind) => void
  disposed: boolean
}

class TestAheadBehindStore {
  public readonly requests = new Array<IAheadBehindRequest>()
  private readonly cachedResults = new Map<string, IAheadBehind>()

  public setCachedResult(from: string, to: string, aheadBehind: IAheadBehind) {
    this.cachedResults.set(`${from}:${to}`, aheadBehind)
  }

  public tryGetAheadBehind(_repository: Repository, from: string, to: string) {
    return this.cachedResults.get(`${from}:${to}`)
  }

  public getAheadBehind(
    _repository: Repository,
    from: string,
    to: string,
    callback: (aheadBehind: IAheadBehind) => void
  ) {
    const request: IAheadBehindRequest = {
      from,
      to,
      callback,
      disposed: false,
    }
    this.requests.push(request)

    return { dispose: () => (request.disposed = true) }
  }

  public emit(request: IAheadBehindRequest, aheadBehind: IAheadBehind) {
    if (!request.disposed) {
      request.callback(aheadBehind)
    }
  }
}

const owner = new Owner('desktop', 'https://api.github.com', 1)
const gitHubRepository = new GitHubRepository('desktop', owner, 2)
const repository = new Repository(
  '/tmp/desktop-fixture',
  3,
  gitHubRepository,
  false
)

const appMenu: IMenu = {
  type: 'menu',
  items: [
    {
      id: 'create-pull-request',
      type: 'menuItem',
      label: 'Create Pull Request',
      enabled: true,
      visible: true,
      accelerator: null,
      accessKey: null,
    },
    {
      id: 'preview-pull-request',
      type: 'menuItem',
      label: 'Preview Pull Request',
      enabled: true,
      visible: true,
      accelerator: null,
      accessKey: null,
    },
    {
      id: 'open-working-directory',
      type: 'menuItem',
      label: 'Show in Explorer',
      enabled: true,
      visible: true,
      accelerator: null,
      accessKey: null,
    },
    {
      id: 'view-repository-on-github',
      type: 'menuItem',
      label: 'View on GitHub',
      enabled: true,
      visible: true,
      accelerator: null,
      accessKey: null,
    },
  ],
}

function createBranch(name: string, sha: string) {
  return new Branch(
    name,
    `origin/${name}`,
    { sha },
    BranchType.Local,
    `refs/heads/${name}`
  )
}

function createRepositoryState(
  currentSha: string,
  defaultSha: string
): IRepositoryState {
  return {
    remote: { name: 'origin', url: 'https://github.com/desktop/desktop.git' },
    aheadBehind: { ahead: 0, behind: 0 },
    tagsToPush: null,
    changesState: { stashEntry: null },
    branchesState: {
      tip: {
        kind: TipState.Valid,
        branch: createBranch('feature', currentSha),
      },
      defaultBranch: createBranch('main', defaultSha),
      currentPullRequest: null,
      forcePushBranches: new Map<string, string>(),
    },
  } as unknown as IRepositoryState
}

function noChangesElement(
  aheadBehindStore: TestAheadBehindStore,
  repositoryState: IRepositoryState
) {
  const props = {
    aheadBehindStore: aheadBehindStore as unknown as AheadBehindStore,
    repositoryState,
    repository,
    appMenu,
    dispatcher: {} as Dispatcher,
    isExternalEditorAvailable: false,
  }

  return <NoChanges {...props} />
}

describe('NoChanges', () => {
  it('does not suggest a pull request when the current and default tips match', () => {
    const store = new TestAheadBehindStore()
    const view = render(
      noChangesElement(store, createRepositoryState('a', 'a'))
    )

    assert.equal(view.container.querySelector('.pull-request-action'), null)
    assert.equal(store.requests.length, 0)
  })

  it('suggests a pull request only after the current branch is found ahead', () => {
    const store = new TestAheadBehindStore()
    const view = render(
      noChangesElement(store, createRepositoryState('b', 'a'))
    )

    assert.equal(view.container.querySelector('.pull-request-action'), null)
    assert.equal(store.requests.length, 1)
    assert.deepEqual(store.requests[0], {
      from: 'b',
      to: 'a',
      callback: store.requests[0].callback,
      disposed: false,
    })

    act(() => store.emit(store.requests[0], { ahead: 1, behind: 0 }))

    assert.notEqual(view.container.querySelector('.pull-request-action'), null)
  })

  it('keeps the suggestion hidden when the current branch is not ahead', () => {
    const store = new TestAheadBehindStore()
    const view = render(
      noChangesElement(store, createRepositoryState('b', 'a'))
    )

    act(() => store.emit(store.requests[0], { ahead: 0, behind: 1 }))

    assert.equal(view.container.querySelector('.pull-request-action'), null)
  })

  it('replaces stale comparisons and disposes them on unmount', () => {
    const store = new TestAheadBehindStore()
    const view = render(
      noChangesElement(store, createRepositoryState('b', 'a'))
    )
    const firstRequest = store.requests[0]

    view.rerender(noChangesElement(store, createRepositoryState('c', 'a')))

    assert.equal(firstRequest.disposed, true)
    assert.equal(store.requests.length, 2)
    assert.equal(store.requests[1].from, 'c')
    assert.equal(store.requests[1].to, 'a')

    view.unmount()

    assert.equal(store.requests[1].disposed, true)
  })

  it('uses a cached comparison without subscribing', () => {
    const store = new TestAheadBehindStore()
    store.setCachedResult('b', 'a', { ahead: 1, behind: 0 })

    const view = render(
      noChangesElement(store, createRepositoryState('b', 'a'))
    )

    assert.notEqual(view.container.querySelector('.pull-request-action'), null)
    assert.equal(store.requests.length, 0)
  })
})
