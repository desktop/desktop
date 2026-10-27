import { describe, it } from 'node:test'
import assert from 'node:assert'
import { GitError as DugiteError } from 'dugite'
import { GitError } from '../../src/lib/git/core'
import { ErrorWithMetadata } from '../../src/lib/error-with-metadata'
import {
  describeFetchAllFailure,
  formatFetchAllProgress,
  formatFetchAllSummary,
  IFetchAllRepositoryFailure,
  isMissingRepositoryError,
  mapWithConcurrency,
} from '../../src/lib/fetch-all-repositories'

function failure(name: string, message: string): IFetchAllRepositoryFailure {
  return { id: name.length, name, message }
}

function gitFailure(gitError: DugiteError, description: string): GitError {
  return new GitError(
    {
      stdout: '',
      stderr: description,
      exitCode: 1,
      gitError,
      gitErrorDescription: description,
      path: '',
    },
    ['fetch', 'origin'],
    description
  )
}

describe('fetch all repositories', () => {
  describe('mapWithConcurrency', () => {
    it('does nothing for an empty list', async () => {
      let calls = 0
      await mapWithConcurrency(
        [],
        3,
        async () => {
          calls++
        },
        () => {
          calls++
        }
      )
      assert.equal(calls, 0)
    })

    it('keeps going when one item fails and limits how many run at once', async () => {
      const items = ['a', 'b', 'c', 'd', 'e']
      const finished: string[] = []
      let inFlight = 0
      let maxInFlight = 0
      const progress: number[] = []

      await mapWithConcurrency(
        items,
        2,
        async item => {
          inFlight++
          maxInFlight = Math.max(maxInFlight, inFlight)
          await new Promise(resolve => setTimeout(resolve, 15))
          inFlight--
          if (item === 'c') {
            throw new Error('auth failed')
          }
          finished.push(item)
        },
        update => progress.push(update.completed)
      )

      assert.equal(maxInFlight, 2)
      assert.deepEqual(finished.sort(), ['a', 'b', 'd', 'e'])
      assert.deepEqual(progress, [1, 2, 3, 4, 5])
    })
  })

  describe('formatFetchAllProgress', () => {
    it('shows how many repositories have settled', () => {
      assert.equal(
        formatFetchAllProgress({ completed: 2, total: 5 }),
        'Fetching 2/5'
      )
    })
  })

  describe('formatFetchAllSummary', () => {
    it('reports a clean fetch', () => {
      assert.equal(formatFetchAllSummary(1, []), 'Fetched 1 repository.')
      assert.equal(formatFetchAllSummary(3, []), 'Fetched 3 repositories.')
    })

    it('names a few failures and counts the rest', () => {
      const message = formatFetchAllSummary(5, [
        failure('alpha', 'Authentication failed'),
        failure('beta', 'No remote configured'),
        failure('gamma', 'Repository folder is missing'),
      ])

      assert.equal(
        message,
        'Fetched 2 of 5 repositories. 3 failed: alpha (Authentication failed), beta (No remote configured), and 1 more.'
      )
    })

    it('describes a fetch where nothing succeeded', () => {
      assert.equal(
        formatFetchAllSummary(1, [failure('solo', 'Authentication failed')]),
        'Could not fetch 1 repository: solo (Authentication failed).'
      )
    })
  })

  describe('describeFetchAllFailure', () => {
    it('uses the error message for ordinary failures', () => {
      assert.equal(
        describeFetchAllFailure(new Error('No remote configured')),
        'No remote configured'
      )
    })

    it('unwraps metadata and shortens authentication errors', () => {
      const error = new ErrorWithMetadata(
        gitFailure(
          DugiteError.HTTPSAuthenticationFailed,
          'Authentication failed. Some common reasons include:\n- You are not logged in'
        ),
        {}
      )

      assert.equal(describeFetchAllFailure(error), 'Authentication failed')
    })

    it('recognizes a missing repository folder', () => {
      const error = gitFailure(
        DugiteError.NotAGitRepository,
        'fatal: not a git repository'
      )
      assert.equal(
        describeFetchAllFailure(error),
        'Repository folder is missing'
      )
      assert.equal(isMissingRepositoryError(error), true)
      assert.equal(
        isMissingRepositoryError(new Error('No remote configured')),
        false
      )
    })

    it('keeps only the first line of a long message', () => {
      const message = `${'x'.repeat(100)}\nmore detail`
      const described = describeFetchAllFailure(new Error(message))
      assert.equal(described.endsWith('…'), true)
      assert.equal(described.includes('\n'), false)
      assert.equal(described.length, 80)
    })
  })
})
