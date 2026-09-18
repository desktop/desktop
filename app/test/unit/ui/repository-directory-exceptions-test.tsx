import assert from 'node:assert'
import { before, beforeEach, describe, it, mock } from 'node:test'
import * as Path from 'path'
import * as React from 'react'

import type { RepositoryType } from '../../../src/lib/git/rev-parse'
import { Repository } from '../../../src/models/repository'
import type { Dispatcher } from '../../../src/ui/dispatcher'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

const unsafePath = Path.resolve('repository with spaces')
const requestedPath = Path.join(unsafePath, 'subdirectory')
const repository = new Repository(requestedPath, 1, null, true)

const getRepositoryType = mock.fn(
  async (_path: string): Promise<RepositoryType> => ({
    kind: 'unsafe',
    path: unsafePath,
  })
)
const addSafeDirectory = mock.fn(async (_path: string) => {})

before(() => {
  mock.module('../../../src/lib/git/index.ts', {
    namedExports: { getRepositoryType, addSafeDirectory },
  })
  mock.module('../../../src/ui/main-process-proxy.ts', {
    namedExports: {
      sendDialogDidOpen: () => {},
      showOpenDialog: async () => null,
    },
  })
})

function createDispatcher() {
  const postError = mock.fn((_error: unknown) => {})
  const refreshRepository = mock.fn(async (_repository: Repository) => {})
  const addRepositories = mock.fn(async (_paths: ReadonlyArray<string>) => [])

  return {
    postError,
    refreshRepository,
    addRepositories,
    dispatcher: {
      postError,
      refreshRepository,
      addRepositories,
    } as unknown as Dispatcher,
  }
}

function returnRegularRepositoryAfterTrust() {
  getRepositoryType.mock.mockImplementationOnce(
    async () => ({
      kind: 'regular',
      topLevelWorkingDirectory: unsafePath,
      gitDir: Path.join(unsafePath, '.git'),
    }),
    1
  )
}

beforeEach(() => {
  getRepositoryType.mock.resetCalls()
  addSafeDirectory.mock.resetCalls()
  addSafeDirectory.mock.mockImplementation(async () => {})
})

describe('AddExistingRepository directory exceptions', () => {
  async function renderUnsafeRepository() {
    const { AddExistingRepository } = await import(
      '../../../src/ui/add-repository/add-existing-repository'
    )
    const dispatcher = createDispatcher()
    const onDismissed = mock.fn()
    const view = render(
      <AddExistingRepository
        dispatcher={dispatcher.dispatcher}
        path={requestedPath}
        onDismissed={onDismissed}
      />
    )

    fireEvent.click(
      screen.getByRole('button', { name: /add repository/i, hidden: true })
    )
    const trustButton = await screen.findByRole('button', {
      name: 'add an exception for this directory',
      hidden: true,
    })
    assert.deepStrictEqual(getRepositoryType.mock.calls[0].arguments, [
      requestedPath,
    ])

    return { ...dispatcher, ...view, onDismissed, trustButton }
  }

  it('trusts the exact unsafe directory and revalidates the entered path', async () => {
    returnRegularRepositoryAfterTrust()
    const view = await renderUnsafeRepository()

    fireEvent.click(view.trustButton)

    assert.ok(view.container.querySelector('.dialog-header .spin'))
    assert.deepStrictEqual(
      addSafeDirectory.mock.calls.map(c => c.arguments),
      [[unsafePath]]
    )
    assert.strictEqual(getRepositoryType.mock.callCount(), 1)

    await waitFor(() => {
      assert.ok(view.container.querySelector('.dialog-header .spin') === null)
      assert.ok(
        screen.queryByRole('button', {
          name: 'add an exception for this directory',
          hidden: true,
        }) === null
      )
    })

    assert.deepStrictEqual(
      getRepositoryType.mock.calls.map(c => c.arguments),
      [[requestedPath], [requestedPath]]
    )
    assert.strictEqual(view.postError.mock.callCount(), 0)
    assert.strictEqual(view.addRepositories.mock.callCount(), 0)
    assert.strictEqual(view.onDismissed.mock.callCount(), 0)
  })

  it('posts a failed exception write and stops loading without revalidating', async () => {
    const error = new Error('Unable to write repository exception')
    addSafeDirectory.mock.mockImplementation(async () => {
      throw error
    })
    const view = await renderUnsafeRepository()

    fireEvent.click(view.trustButton)

    assert.ok(view.container.querySelector('.dialog-header .spin'))
    await waitFor(() => {
      assert.deepStrictEqual(
        view.postError.mock.calls.map(c => c.arguments),
        [[error]]
      )
      assert.ok(view.container.querySelector('.dialog-header .spin') === null)
    })

    assert.deepStrictEqual(
      addSafeDirectory.mock.calls.map(c => c.arguments),
      [[unsafePath]]
    )
    assert.strictEqual(getRepositoryType.mock.callCount(), 1)
    assert.ok(
      screen.getByRole('button', {
        name: 'add an exception for this directory',
        hidden: true,
      })
    )
    assert.strictEqual(view.addRepositories.mock.callCount(), 0)
    assert.strictEqual(view.onDismissed.mock.callCount(), 0)
  })
})

describe('MissingRepository directory exceptions', () => {
  async function renderUnsafeRepository() {
    const { MissingRepository } = await import(
      '../../../src/ui/missing-repository'
    )
    const dispatcher = createDispatcher()
    const view = render(
      <MissingRepository
        dispatcher={dispatcher.dispatcher}
        repository={repository}
      />
    )
    const trustButton = await screen.findByRole('button', {
      name: /trust repository/i,
    })
    assert.deepStrictEqual(getRepositoryType.mock.calls[0].arguments, [
      requestedPath,
    ])

    return { ...dispatcher, ...view, trustButton }
  }

  it('trusts the exact unsafe directory and refreshes after rechecking the repository', async () => {
    returnRegularRepositoryAfterTrust()
    const view = await renderUnsafeRepository()

    fireEvent.click(view.trustButton)

    assert.strictEqual(view.trustButton.getAttribute('aria-disabled'), 'true')
    assert.ok(view.trustButton.querySelector('.spin'))
    assert.strictEqual(getRepositoryType.mock.callCount(), 1)
    assert.strictEqual(view.refreshRepository.mock.callCount(), 0)

    await waitFor(() => {
      assert.strictEqual(view.trustButton.hasAttribute('aria-disabled'), false)
      assert.ok(view.trustButton.querySelector('.spin') === null)
      assert.deepStrictEqual(
        view.refreshRepository.mock.calls.map(c => c.arguments),
        [[repository]]
      )
    })

    assert.deepStrictEqual(
      addSafeDirectory.mock.calls.map(c => c.arguments),
      [[unsafePath]]
    )
    assert.deepStrictEqual(
      getRepositoryType.mock.calls.map(c => c.arguments),
      [[requestedPath], [requestedPath]]
    )
    assert.strictEqual(view.postError.mock.callCount(), 0)
  })

  it('posts a failed exception write and enables retry without rechecking or refreshing', async () => {
    const error = new Error('Unable to write repository exception')
    addSafeDirectory.mock.mockImplementation(async () => {
      throw error
    })
    const view = await renderUnsafeRepository()

    fireEvent.click(view.trustButton)

    assert.strictEqual(view.trustButton.getAttribute('aria-disabled'), 'true')
    assert.ok(view.trustButton.querySelector('.spin'))
    await waitFor(() => {
      assert.deepStrictEqual(
        view.postError.mock.calls.map(c => c.arguments),
        [[error]]
      )
      assert.strictEqual(view.trustButton.hasAttribute('aria-disabled'), false)
      assert.ok(view.trustButton.querySelector('.spin') === null)
    })

    assert.deepStrictEqual(
      addSafeDirectory.mock.calls.map(c => c.arguments),
      [[unsafePath]]
    )
    assert.strictEqual(getRepositoryType.mock.callCount(), 1)
    assert.strictEqual(view.refreshRepository.mock.callCount(), 0)
  })
})
