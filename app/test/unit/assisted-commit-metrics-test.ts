import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  AssistedCommitMeasure,
  createAssistedCommitMetrics,
} from '../../src/lib/assisted-commit/metrics'
import { assistedCommitErrorCauses } from '../../src/lib/assisted-commit-run'
import { ErrorWithMetadata } from '../../src/lib/error-with-metadata'
import {
  AssistedCommitError,
  IAssistedCommitRecovery,
} from '../../src/lib/git/assisted-commit'

describe('assisted commit processing metrics', () => {
  it('diagnoses nested cyclic recovery errors once without changing shared failure traversal', async () => {
    const counts = new Map<AssistedCommitMeasure, number>()
    const metrics = createAssistedCommitMetrics(
      true,
      async (key, value = 1) => {
        counts.set(key, (counts.get(key) ?? 0) + value)
      }
    )
    const recoveryErrors: unknown[] = []
    const recovery: IAssistedCommitRecovery = {
      snapshot: {
        id: 'synthetic-snapshot',
        repositoryId: 1,
        repositoryPath: '/unused-metrics-fixture',
        originalHead: { ref: 'refs/heads/main', sha: null },
        selectedTree: 'synthetic-tree',
        analysis: { snapshotId: 'synthetic-snapshot', changes: [] },
        originalSelection: [],
      },
      createdCommits: [],
      expectedTip: null,
      observedHead: null,
      history: 'interfered',
      index: 'interfered',
      errors: recoveryErrors,
    }
    const cancelled = new AssistedCommitError('cancelled', 'User cancelled')
    const failure = new AssistedCommitError(
      'recovery-failed',
      'Rollback failed',
      {
        cause: cancelled,
        recovery,
      }
    )
    const drift = new AssistedCommitError(
      'index-changed',
      'External index changed'
    )
    const nested = new AssistedCommitError(
      'recovery-failed',
      'Nested recovery',
      {
        recovery: {
          ...recovery,
          errors: [
            new ErrorWithMetadata(
              new Error('Wrapped drift', { cause: drift }),
              {}
            ),
          ],
        },
      }
    )
    recoveryErrors.push(new AggregateError([nested, failure, drift]))
    const sharedCauses = assistedCommitErrorCauses(failure)
    assert.deepStrictEqual(sharedCauses, [failure, cancelled])

    metrics.diagnose(new ErrorWithMetadata(failure, {}))
    await metrics.flush()
    assert.strictEqual(
      counts.get('copilotAssistedCommitRepositoryChangedCount'),
      1
    )
    metrics.diagnose(new AggregateError([failure, nested, drift]))
    await metrics.flush()
    assert.strictEqual(
      counts.get('copilotAssistedCommitRepositoryChangedCount'),
      1
    )
    assert.deepStrictEqual(assistedCommitErrorCauses(failure), sharedCauses)
    assert.strictEqual(failure.recovery, recovery)
    assert.strictEqual(failure.cause, cancelled)
  })

  for (const [milliseconds, thresholds] of [
    [15000, 0],
    [15001, 1],
    [30000, 1],
    [30001, 2],
    [60000, 2],
    [70000, 3],
    [120000, 3],
    [120001, 4],
  ]) {
    it(`counts cumulative strict thresholds at ${milliseconds}ms, excluding user waits`, async t => {
      let now = 100
      t.mock.method(performance, 'now', () => now)
      const counts = new Map<AssistedCommitMeasure, number>()
      const metrics = createAssistedCommitMetrics(
        true,
        async (key, value = 1) => {
          counts.set(key, (counts.get(key) ?? 0) + value)
        }
      )
      now += 1000
      metrics.wait()
      now += 200000
      metrics.resume()
      now += milliseconds - 1000
      metrics.accepted(2)
      now += 200000
      metrics.accepted(2)
      await metrics.flush()
      assert.strictEqual(counts.get('copilotAssistedCommitAcceptedCount'), 1)
      assert.strictEqual(
        counts.get('copilotAssistedCommitCreatedCommitCount'),
        2
      )
      assert.strictEqual(
        counts.get('copilotAssistedCommitMultiCommitRunCount'),
        1
      )
      const fields: ReadonlyArray<AssistedCommitMeasure> = [
        'copilotAssistedCommitOver15sCount',
        'copilotAssistedCommitOver30sCount',
        'copilotAssistedCommitOver60sCount',
        'copilotAssistedCommitOver120sCount',
      ]
      assert.deepStrictEqual(
        fields.map(field => counts.get(field) ?? 0),
        fields.map((_, index) => (index < thresholds ? 1 : 0))
      )
    })
  }

  it('does not retry a metric after synchronous or asynchronous persistence errors', async () => {
    for (const asynchronous of [false, true]) {
      let attempts = 0
      const metrics = createAssistedCommitMetrics(true, () => {
        attempts++
        const error = new Error('Synthetic statistics failure')
        if (asynchronous) {
          return Promise.reject(error)
        }
        throw error
      })
      metrics.once('copilotAssistedCommitStartedCount')
      await metrics.flush()
      metrics.once('copilotAssistedCommitStartedCount')
      await metrics.flush()
      assert.strictEqual(attempts, 1)
    }
  })

  it('excludes empty commits from every AI run, output, recovery and duration metric', async t => {
    let now = 0
    t.mock.method(performance, 'now', () => now)
    const counts: string[] = []
    const metrics = createAssistedCommitMetrics(false, async key => {
      counts.push(key)
    })
    metrics.once('copilotAssistedCommitStartedCount')
    metrics.recovery('started')
    metrics.recovery('succeeded')
    now = 130000
    metrics.accepted(1)
    metrics.accepted(1)
    await metrics.flush()
    assert.deepStrictEqual(counts, ['copilotAssistedCommitEmptyCommitCount'])
  })
})
