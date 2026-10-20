import assert from 'node:assert'
import { afterEach, beforeEach, describe, it, TestContext } from 'node:test'
import { promises as FileSystem } from 'fs'
import { basename, join } from 'path'
import {
  AssistedCommitError,
  captureAssistedCommitSnapshot,
  createSingleAssistedCommitPlan,
  disposeAssistedCommitSnapshot,
  executeAssistedCommitPlan,
  finalizeAssistedCommitTransaction,
  IAssistedCommitCleanupToken,
  IAssistedCommitRecoveryToken,
  retryAssistedCommitCleanup,
  rollbackAssistedCommitTransaction,
  validateAssistedCommitPlan,
  withAssistedCommitSnapshot,
} from '../../../src/lib/git/assisted-commit'
import { getSnapshotData } from '../../../src/lib/git/assisted-commit/state'
import { setHooksEnvEnabled } from '../../../src/lib/hooks/config'
import {
  count,
  createPathMatcher,
  indexPath,
  optionalBytes,
  rawGit,
  request,
  seed,
  tip,
} from '../../helpers/assisted-commit'
import { createTempDirectory } from '../../helpers/temp'

interface ICleanupFaultState {
  directory: string
  fail: boolean
  attempts: number
  captureError?: Error
  onCreated?: () => void
  beforeRemove?: () => Promise<void>
}

function containsCause(error: unknown, expected: unknown): boolean {
  return (
    error === expected ||
    (error instanceof Error && containsCause(error.cause, expected)) ||
    (error instanceof AggregateError &&
      error.errors.some(cause => containsCause(cause, expected)))
  )
}

async function cleanupFailure(
  operation: Promise<unknown>
): Promise<AssistedCommitError> {
  try {
    await operation
  } catch (error) {
    assert.ok(error instanceof AssistedCommitError)
    assert.strictEqual(error.code, 'cleanup-failed')
    return error
  }
  assert.fail('Expected an observable cleanup failure')
}

function cleanupToken(error: AssistedCommitError): IAssistedCommitCleanupToken {
  assert.ok(
    error.cleanupToken,
    'Cleanup failure must expose its retry capability'
  )
  return error.cleanupToken
}

async function fixture(t: TestContext) {
  const repository = await seed(t, { selected: 'old\n', other: 'base\n' })
  await FileSystem.writeFile(
    join(repository.path, 'other'),
    'original staging\n'
  )
  await rawGit(repository, ['add', '--', 'other'])
  await FileSystem.writeFile(join(repository.path, 'selected'), 'SELECTED\n')
  const input = await request(repository, ['selected'])
  const original = await tip(repository)
  const index = await indexPath(repository)
  const originalIndex = await FileSystem.readFile(index)
  const remove = FileSystem.rm
  const makeTemporaryDirectory = FileSystem.mkdtemp
  const write = FileSystem.writeFile
  const state: ICleanupFaultState = {
    directory: '',
    fail: true,
    attempts: 0,
  }
  const removalError = new Error('Injected owned temporary cleanup EIO')
  const directories = new Set<string>()
  let matchesDirectory: ((path: unknown) => Promise<boolean>) | undefined
  let matchesConfiguration: ((path: unknown) => Promise<boolean>) | undefined
  t.after(async () => {
    for (const directory of directories) {
      await remove(directory, { recursive: true, force: true })
    }
  })
  t.mock.method(
    FileSystem,
    'mkdtemp',
    async (...args: Parameters<typeof FileSystem.mkdtemp>) => {
      const directory = await makeTemporaryDirectory(...args)
      if (basename(directory).startsWith('desktop-assisted-commit-')) {
        directories.add(directory)
        state.directory = directory
        matchesDirectory = await createPathMatcher(directory)
        matchesConfiguration = await createPathMatcher(
          join(directory, 'config')
        )
        state.onCreated?.()
      }
      return directory
    }
  )
  t.mock.method(
    FileSystem,
    'writeFile',
    async (...args: Parameters<typeof FileSystem.writeFile>) => {
      if (
        state.captureError !== undefined &&
        (await matchesConfiguration?.(args[0]))
      ) {
        throw state.captureError
      }
      return write(...args)
    }
  )
  t.mock.method(
    FileSystem,
    'rm',
    async (...args: Parameters<typeof FileSystem.rm>) => {
      if (await matchesDirectory?.(args[0])) {
        state.attempts++
        await state.beforeRemove?.()
        if (state.fail) {
          throw removalError
        }
      }
      return remove(...args)
    }
  )
  const assertUnchanged = async () => {
    assert.strictEqual(await tip(repository), original)
    assert.strictEqual(await count(repository), 1)
    assert.deepStrictEqual(await FileSystem.readFile(index), originalIndex)
    assert.deepStrictEqual(
      await FileSystem.readFile(join(repository.path, 'selected')),
      Buffer.from('SELECTED\n')
    )
    assert.deepStrictEqual(
      await FileSystem.readFile(join(repository.path, 'other')),
      Buffer.from('original staging\n')
    )
  }
  return {
    repository,
    input,
    state,
    removalError,
    assertUnchanged,
    removeOwnedDirectory: remove,
  }
}

describe('git/assisted-commit cleanup-only retry', () => {
  beforeEach(() => setHooksEnvEnabled(false))
  afterEach(() => localStorage.removeItem('git-hooks-env-enabled'))

  for (const failure of ['capture', 'capture-cancellation']) {
    it(`retains owned cleanup before a snapshot or callback exists (${failure})`, async t => {
      const { repository, input, state, removalError, assertUnchanged } =
        await fixture(t)
      const originalError = new Error(
        'Injected private configuration write EIO'
      )
      const controller = new AbortController()
      if (failure === 'capture') {
        state.captureError = originalError
      } else {
        state.onCreated = () => controller.abort()
      }
      let called = false
      const error = await cleanupFailure(
        withAssistedCommitSnapshot(
          repository,
          input,
          async () => {
            called = true
          },
          { signal: controller.signal }
        )
      )
      assert.strictEqual(called, false)
      assert.strictEqual(error.recovery, undefined)
      assert.ok(state.attempts > 0, 'The owned rm fault must fire')
      assert.ok(containsCause(error, removalError))
      if (failure === 'capture') {
        assert.ok(containsCause(error, originalError))
      } else {
        assert.ok(
          error.cause instanceof AggregateError &&
            error.cause.errors.some(
              cause =>
                cause instanceof AssistedCommitError &&
                cause.code === 'cancelled'
            )
        )
      }
      const token = cleanupToken(error)
      assert.deepStrictEqual(Object.keys(token), ['id'])
      assert.ok(!JSON.stringify(token).includes(state.directory))
      const attempts = state.attempts
      const repeated = await cleanupFailure(retryAssistedCommitCleanup(token))
      assert.strictEqual(cleanupToken(repeated), token)
      assert.ok(
        state.attempts > attempts,
        'Retry must exercise the owned rm fault'
      )
      state.fail = false
      await retryAssistedCommitCleanup(token)
      await retryAssistedCommitCleanup(token)
      await assert.rejects(FileSystem.lstat(state.directory), {
        code: 'ENOENT',
      })
      await assertUnchanged()
    })
  }

  for (const operation of ['planner', 'validation', 'cancelled', 'success']) {
    it(`exposes scope cleanup without executor recovery (${operation})`, async t => {
      const { repository, input, state, removalError, assertUnchanged } =
        await fixture(t)
      const originalError =
        operation === 'cancelled'
          ? new AssistedCommitError('cancelled', 'Planning cancelled')
          : new Error('Planner failed before execution')
      let operationError: unknown
      const error = await cleanupFailure(
        withAssistedCommitSnapshot(repository, input, async snapshot => {
          try {
            if (operation === 'validation') {
              await validateAssistedCommitPlan(snapshot, {
                snapshotId: snapshot.id,
                commits: [],
              })
            } else if (operation !== 'success') {
              throw originalError
            }
            return 'No executor ran'
          } catch (cause) {
            operationError = cause
            throw cause
          }
        })
      )
      assert.strictEqual(error.recovery, undefined)
      assert.ok(containsCause(error, removalError))
      if (operation !== 'success') {
        assert.ok(operationError instanceof Error)
        assert.ok(containsCause(error, operationError))
      }
      assert.ok(state.attempts > 0)
      const token = cleanupToken(error)
      state.fail = false
      await retryAssistedCommitCleanup(token)
      await assert.rejects(FileSystem.lstat(state.directory), {
        code: 'ENOENT',
      })
      await assertUnchanged()
    })
  }

  it('rejects forged cleanup capabilities without accepting serialized paths', async t => {
    const { repository, input, state, assertUnchanged } = await fixture(t)
    const error = await cleanupFailure(
      withAssistedCommitSnapshot(repository, input, async () => {})
    )
    const token = cleanupToken(error)
    const attempts = state.attempts
    for (const forged of [
      { id: token.id },
      { id: token.id, directory: repository.path },
    ]) {
      await assert.rejects(
        retryAssistedCommitCleanup(forged),
        cause =>
          cause instanceof AssistedCommitError && cause.code === 'disposed'
      )
    }
    assert.strictEqual(state.attempts, attempts)
    state.fail = false
    await retryAssistedCommitCleanup(token)
    await assertUnchanged()
  })

  it('keeps low-level disposal and cleanup retry consistent and mutually exclusive', async t => {
    const { repository, input, state, assertUnchanged } = await fixture(t)
    const snapshot = await captureAssistedCommitSnapshot(repository, input)
    const error = await cleanupFailure(disposeAssistedCommitSnapshot(snapshot))
    const token = cleanupToken(error)
    let resume: () => void = () => {}
    let started: () => void = () => {}
    const pending = new Promise<void>(resolve => {
      resume = resolve
    })
    const entered = new Promise<void>(resolve => {
      started = resolve
    })
    state.fail = false
    state.beforeRemove = async () => {
      started()
      await pending
    }
    const cleanup = retryAssistedCommitCleanup(token)
    try {
      await entered
      for (const operation of [
        () => retryAssistedCommitCleanup(token),
        () => disposeAssistedCommitSnapshot(snapshot),
        () => validateAssistedCommitPlan(snapshot, {}),
      ]) {
        await assert.rejects(
          operation(),
          cause => cause instanceof AssistedCommitError && cause.code === 'busy'
        )
      }
    } finally {
      resume()
      await cleanup
    }
    await disposeAssistedCommitSnapshot(snapshot)
    await retryAssistedCommitCleanup(token)
    assert.throws(() => getSnapshotData(snapshot), /disposed/)
    await assertUnchanged()
  })

  it('refuses cleanup while validation or execution uses the snapshot', async t => {
    const { repository, input, state } = await fixture(t)
    const snapshot = await captureAssistedCommitSnapshot(repository, input)
    const error = await cleanupFailure(disposeAssistedCommitSnapshot(snapshot))
    const token = cleanupToken(error)
    state.fail = false
    const attempts = state.attempts
    const assertBusy = async () => {
      await assert.rejects(
        retryAssistedCommitCleanup(token),
        cause => cause instanceof AssistedCommitError && cause.code === 'busy'
      )
      assert.strictEqual(state.attempts, attempts)
    }
    const checked = await validateAssistedCommitPlan(
      snapshot,
      createSingleAssistedCommitPlan(snapshot, {
        reason: 'uncertain-boundaries',
        title: 'Commit selected content',
      }),
      { onProgress: assertBusy }
    )
    const result = await executeAssistedCommitPlan(snapshot, checked, {
      onProgress: assertBusy,
    })
    await retryAssistedCommitCleanup(token)
    await disposeAssistedCommitSnapshot(snapshot)
    finalizeAssistedCommitTransaction(result)
    assert.strictEqual(await count(repository), 2)
    assert.strictEqual(await optionalBytes(join(state.directory, 'HEAD')), null)
  })

  it('cleans only temporary resources after unrelated HEAD, index and file changes', async t => {
    const { repository, input, state } = await fixture(t)
    const error = await cleanupFailure(
      withAssistedCommitSnapshot(repository, input, async () => {
        throw new Error('Analysis failed')
      })
    )
    const token = cleanupToken(error)
    await rawGit(repository, ['checkout', '-b', 'external-work'])
    await FileSystem.writeFile(
      join(repository.path, 'other'),
      'later staging\n'
    )
    await rawGit(repository, ['add', '--', 'other'])
    await FileSystem.writeFile(join(repository.path, 'selected'), 'CURRENT\n')
    const index = await indexPath(repository)
    const currentIndex = await FileSystem.readFile(index)
    const currentHead = await tip(repository)
    state.fail = false
    await retryAssistedCommitCleanup(token)
    assert.strictEqual(await tip(repository), currentHead)
    assert.strictEqual(
      await rawGit(repository, ['symbolic-ref', 'HEAD']),
      'refs/heads/external-work'
    )
    assert.deepStrictEqual(await FileSystem.readFile(index), currentIndex)
    assert.deepStrictEqual(
      await FileSystem.readFile(join(repository.path, 'selected')),
      Buffer.from('CURRENT\n')
    )
    assert.deepStrictEqual(
      await FileSystem.readFile(join(repository.path, 'other')),
      Buffer.from('later staging\n')
    )
    await assert.rejects(FileSystem.lstat(state.directory), { code: 'ENOENT' })
  })

  for (const replacement of ['directory', 'symlink']) {
    it(`refuses a replaced temporary root without deleting the replacement (${replacement})`, async t => {
      const { repository, input, state, assertUnchanged } = await fixture(t)
      const error = await cleanupFailure(
        withAssistedCommitSnapshot(repository, input, async () => {})
      )
      const token = cleanupToken(error)
      const container = await createTempDirectory(t)
      const retained = join(container, 'retained-owned-directory')
      const unrelated = join(container, 'unrelated-directory')
      await FileSystem.mkdir(unrelated)
      await FileSystem.writeFile(join(unrelated, 'marker'), 'DO NOT REMOVE')
      await FileSystem.rename(state.directory, retained)
      try {
        if (replacement === 'directory') {
          await FileSystem.mkdir(state.directory)
          await FileSystem.writeFile(
            join(state.directory, 'marker'),
            'REPLACEMENT'
          )
        } else {
          await FileSystem.symlink(
            unrelated,
            state.directory,
            process.platform === 'win32' ? 'junction' : 'dir'
          )
        }
        state.fail = false
        const attempts = state.attempts
        const refused = await cleanupFailure(retryAssistedCommitCleanup(token))
        assert.strictEqual(cleanupToken(refused), token)
        assert.strictEqual(
          state.attempts,
          attempts,
          'An unowned root must not reach rm'
        )
        assert.deepStrictEqual(
          await FileSystem.readFile(join(unrelated, 'marker')),
          Buffer.from('DO NOT REMOVE')
        )
        if (replacement === 'directory') {
          assert.deepStrictEqual(
            await FileSystem.readFile(join(state.directory, 'marker')),
            Buffer.from('REPLACEMENT')
          )
        } else {
          assert.ok((await FileSystem.lstat(state.directory)).isSymbolicLink())
        }
      } finally {
        await FileSystem.rm(state.directory, { recursive: true, force: true })
        await FileSystem.rename(retained, state.directory)
      }
      await retryAssistedCommitCleanup(token)
      await retryAssistedCommitCleanup(token)
      await assertUnchanged()
    })
  }

  it('retries a partially removed owned directory and retires its snapshot', async t => {
    const { repository, input, state, assertUnchanged } = await fixture(t)
    const snapshot = await captureAssistedCommitSnapshot(repository, input)
    state.beforeRemove = async () => {
      await FileSystem.unlink(join(state.directory, 'config'))
      state.beforeRemove = undefined
    }
    const error = await cleanupFailure(disposeAssistedCommitSnapshot(snapshot))
    const token = cleanupToken(error)
    assert.strictEqual(
      await optionalBytes(join(state.directory, 'config')),
      null
    )
    state.fail = false
    await retryAssistedCommitCleanup(token)
    assert.throws(() => getSnapshotData(snapshot), /disposed/)
    await assertUnchanged()
  })

  it('preserves a non-Error planner rejection when scope cleanup also fails', async t => {
    const { repository, input, state, assertUnchanged } = await fixture(t)
    const error = await cleanupFailure(
      withAssistedCommitSnapshot(repository, input, () =>
        Promise.reject(undefined)
      )
    )
    assert.ok(error.cause instanceof AggregateError)
    assert.strictEqual(error.cause.errors[0], undefined)
    const token = cleanupToken(error)
    state.fail = false
    await retryAssistedCommitCleanup(token)
    await assertUnchanged()
  })

  it('preserves the exact executor recovery token when scope cleanup adds a failure', async t => {
    const { repository, input, state, removalError, assertUnchanged } =
      await fixture(t)
    const controller = new AbortController()
    let originalToken: IAssistedCommitRecoveryToken | undefined
    let failure: AssistedCommitError | undefined
    await assert.rejects(
      withAssistedCommitSnapshot(repository, input, async snapshot => {
        const checked = await validateAssistedCommitPlan(
          snapshot,
          createSingleAssistedCommitPlan(snapshot, {
            reason: 'uncertain-boundaries',
            title: 'Selected content',
          })
        )
        try {
          return await executeAssistedCommitPlan(snapshot, checked, {
            signal: controller.signal,
            onProgress: progress => {
              if (progress.kind === 'committed') {
                controller.abort()
              }
            },
          })
        } catch (error) {
          assert.ok(error instanceof AssistedCommitError)
          originalToken = error.recovery?.retryToken
          throw error
        }
      }),
      error => {
        assert.ok(error instanceof AssistedCommitError)
        failure = error
        return error.code === 'recovery-failed'
      }
    )
    assert.ok(failure)
    assert.ok(originalToken)
    assert.strictEqual(failure.recovery?.retryToken, originalToken)
    assert.ok(containsCause(failure, removalError))
    assert.ok(
      state.attempts >= 2,
      'Both executor and scope cleanup faults must fire'
    )
    const token = cleanupToken(failure)
    state.fail = false
    await retryAssistedCommitCleanup(token)
    const recovered = await rollbackAssistedCommitTransaction(originalToken)
    assert.deepStrictEqual(recovered.errors, [])
    await retryAssistedCommitCleanup(token)
    await assertUnchanged()
  })

  it('retires a token when failed removal already deleted the owned root', async t => {
    const { repository, input, state, assertUnchanged, removeOwnedDirectory } =
      await fixture(t)
    const snapshot = await captureAssistedCommitSnapshot(repository, input)
    state.beforeRemove = async () => {
      state.beforeRemove = undefined
      await removeOwnedDirectory(state.directory, {
        recursive: true,
        force: true,
      })
    }
    const error = await cleanupFailure(disposeAssistedCommitSnapshot(snapshot))
    const token = cleanupToken(error)
    const attempts = state.attempts
    await retryAssistedCommitCleanup(token)
    assert.strictEqual(state.attempts, attempts)
    await disposeAssistedCommitSnapshot(snapshot)
    await retryAssistedCommitCleanup(token)
    assert.throws(() => getSnapshotData(snapshot), /disposed/)
    await assertUnchanged()
  })

  it('retains a pre-snapshot obligation when initial directory identity cannot be observed', async t => {
    const { repository, input, state, assertUnchanged } = await fixture(t)
    const stat = FileSystem.lstat
    const observationError = new Error('Injected initial temporary inode EIO')
    let matchesDirectory: ((path: unknown) => Promise<boolean>) | undefined
    let failed = false
    t.mock.method(
      FileSystem,
      'lstat',
      async (...args: Parameters<typeof FileSystem.lstat>) => {
        if (state.directory.length > 0 && matchesDirectory === undefined) {
          matchesDirectory = await createPathMatcher(state.directory)
        }
        if (!failed && (await matchesDirectory?.(args[0]))) {
          failed = true
          throw observationError
        }
        return stat(...args)
      }
    )
    let called = false
    const error = await cleanupFailure(
      withAssistedCommitSnapshot(repository, input, async () => {
        called = true
      })
    )
    assert.ok(failed, 'The initial owned-directory observation fault must fire')
    assert.strictEqual(called, false)
    assert.ok(containsCause(error, observationError))
    const token = cleanupToken(error)
    const retry = await cleanupFailure(retryAssistedCommitCleanup(token))
    assert.strictEqual(cleanupToken(retry), token)
    assert.strictEqual(
      state.attempts,
      0,
      'Unverified ownership must never reach rm'
    )
    await assertUnchanged()
    state.fail = false
    await FileSystem.rm(state.directory, { recursive: true, force: true })
    await retryAssistedCommitCleanup(token)
    await retryAssistedCommitCleanup(token)
  })
})
