import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  IShowFolderContentsDependencies,
  showFolderContents,
} from '../../src/ui/main-process-proxy'

function createDependencies(
  overrides: Partial<IShowFolderContentsDependencies> = {}
) {
  const calls = {
    confirmations: 0,
    opens: 0,
    reveals: 0,
  }

  const dependencies: IShowFolderContentsDependencies = {
    isDarwin: true,
    stat: async () => ({ isDirectory: () => true }),
    isApplicationBundle: async () => false,
    confirmReveal: async () => {
      calls.confirmations++
      return false
    },
    openDirectory: () => {
      calls.opens++
    },
    revealItem: async () => {
      calls.reveals++
    },
    ...overrides,
  }

  return { calls, dependencies }
}

describe('showFolderContents', () => {
  it('opens a conclusively safe directory directly', async () => {
    const { calls, dependencies } = createDependencies()

    await showFolderContents('/safe/repository', dependencies)

    assert.deepStrictEqual(calls, {
      confirmations: 0,
      opens: 1,
      reveals: 0,
    })
  })

  it('does nothing when the user cancels for an application bundle', async () => {
    const { calls, dependencies } = createDependencies({
      isApplicationBundle: async () => true,
    })

    await showFolderContents('/Applications/Repository.app', dependencies)

    assert.deepStrictEqual(calls, {
      confirmations: 1,
      opens: 0,
      reveals: 0,
    })
  })

  it('reveals an application bundle after confirmation', async () => {
    const testContext = createDependencies({
      isApplicationBundle: async () => true,
    })
    const dependencies: IShowFolderContentsDependencies = {
      ...testContext.dependencies,
      confirmReveal: async () => {
        testContext.calls.confirmations++
        return true
      },
    }

    await showFolderContents('/Applications/Repository.app', dependencies)

    assert.deepStrictEqual(testContext.calls, {
      confirmations: 1,
      opens: 0,
      reveals: 1,
    })
  })

  it('handles a failed reveal after confirmation', async () => {
    const testContext = createDependencies({
      isApplicationBundle: async () => true,
    })
    const dependencies: IShowFolderContentsDependencies = {
      ...testContext.dependencies,
      confirmReveal: async () => {
        testContext.calls.confirmations++
        return true
      },
      revealItem: async () => {
        testContext.calls.reveals++
        throw new Error('Finder unavailable')
      },
    }

    await assert.doesNotReject(
      showFolderContents('/Applications/Repository.app', dependencies)
    )
    assert.deepStrictEqual(testContext.calls, {
      confirmations: 1,
      opens: 0,
      reveals: 1,
    })
  })

  it('does nothing when confirmation fails', async () => {
    const testContext = createDependencies({
      isApplicationBundle: async () => true,
    })
    const dependencies: IShowFolderContentsDependencies = {
      ...testContext.dependencies,
      confirmReveal: async () => {
        testContext.calls.confirmations++
        throw new Error('Dialog unavailable')
      },
    }

    await assert.doesNotReject(
      showFolderContents('/Applications/Repository.app', dependencies)
    )
    assert.deepStrictEqual(testContext.calls, {
      confirmations: 1,
      opens: 0,
      reveals: 0,
    })
  })

  it('warns when application metadata cannot be read', async () => {
    const { calls, dependencies } = createDependencies({
      isApplicationBundle: async () => {
        throw new Error('metadata unavailable')
      },
    })

    await showFolderContents('/unknown/repository', dependencies)

    assert.deepStrictEqual(calls, {
      confirmations: 1,
      opens: 0,
      reveals: 0,
    })
  })

  it('warns when file information cannot be read', async () => {
    const { calls, dependencies } = createDependencies({
      stat: async () => {
        throw new Error('file information unavailable')
      },
    })

    await showFolderContents('/unknown/repository', dependencies)

    assert.deepStrictEqual(calls, {
      confirmations: 1,
      opens: 0,
      reveals: 0,
    })
  })
})
