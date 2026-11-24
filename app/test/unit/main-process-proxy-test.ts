import assert from 'node:assert'
import { describe, it } from 'node:test'

import { isApplicationBundleFromMetadata } from '../../src/lib/is-application-bundle'
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

  it('opens without confirmation when application metadata cannot be read', async t => {
    const error = new Error('metadata unavailable')
    const logError = t.mock.method(log, 'error')
    const { calls, dependencies } = createDependencies({
      isApplicationBundle: async () => {
        throw error
      },
    })

    await showFolderContents('/unknown/repository', dependencies)

    assert.deepStrictEqual(calls, {
      confirmations: 0,
      opens: 1,
      reveals: 0,
    })
    assert.deepStrictEqual(logError.mock.calls[0].arguments, [
      "Failed to load metadata for path '/unknown/repository'",
      error,
    ])
  })

  for (const metadata of [
    '',
    'kMDItemContentType = (null)',
    'kMDItemContentType = "public.directory"',
  ]) {
    it(`opens without confirmation for inconclusive metadata ${JSON.stringify(
      metadata
    )}`, async () => {
      const { calls, dependencies } = createDependencies({
        isApplicationBundle: async () =>
          isApplicationBundleFromMetadata(metadata),
      })

      await showFolderContents('/unindexed/repository', dependencies)

      assert.deepStrictEqual(calls, {
        confirmations: 0,
        opens: 1,
        reveals: 0,
      })
    })
  }

  it('reveals without confirmation when file information cannot be read', async () => {
    const { calls, dependencies } = createDependencies({
      stat: async () => {
        throw new Error('file information unavailable')
      },
    })

    await showFolderContents('/unknown/repository', dependencies)

    assert.deepStrictEqual(calls, {
      confirmations: 0,
      opens: 0,
      reveals: 1,
    })
  })

  it('reveals a non-directory without confirmation on macOS', async () => {
    const { calls, dependencies } = createDependencies({
      stat: async () => ({ isDirectory: () => false }),
    })

    await showFolderContents('/repository/file', dependencies)

    assert.deepStrictEqual(calls, {
      confirmations: 0,
      opens: 0,
      reveals: 1,
    })
  })

  it('handles a failed reveal when file information is unavailable', async t => {
    const error = new Error('Finder unavailable')
    const logError = t.mock.method(log, 'error')
    const { dependencies } = createDependencies({
      stat: async () => {
        throw new Error('file information unavailable')
      },
      revealItem: async () => {
        throw error
      },
    })

    await assert.doesNotReject(
      showFolderContents('/unknown/repository', dependencies)
    )
    assert.deepStrictEqual(logError.mock.calls[1].arguments, [
      "Unable to reveal folder '/unknown/repository'",
      error,
    ])
  })

  for (const isDarwin of [true, false]) {
    it(`handles a failed non-directory reveal with isDarwin=${isDarwin}`, async t => {
      const error = new Error('Finder unavailable')
      const logError = t.mock.method(log, 'error')
      const { calls, dependencies } = createDependencies({
        isDarwin,
        stat: async () => ({ isDirectory: () => false }),
        revealItem: async () => {
          calls.reveals++
          throw error
        },
      })

      await assert.doesNotReject(
        showFolderContents('/repository/file', dependencies)
      )
      assert.deepStrictEqual(calls, {
        confirmations: 0,
        opens: 0,
        reveals: 1,
      })
      assert.deepStrictEqual(logError.mock.calls[1].arguments, [
        "Unable to reveal folder '/repository/file'",
        error,
      ])
    })
  }
})
