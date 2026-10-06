import assert from 'node:assert'
import { access, lstat, mkdtemp } from 'fs/promises'
import * as fileSystem from 'fs/promises'
import { describe, it, mock } from 'node:test'
import { setImmediate } from 'node:timers/promises'

let createdDirectory: string | undefined
let failInitialStat = false
const failure = new Error('Synthetic ownership stat failure')
const nativeMkdtemp = mkdtemp
const nativeLstat = lstat
const nativeRm = fileSystem.rm
let creationGate: Promise<void> | undefined
let onCreation: (() => void) | undefined
let onDisposal: (() => void) | undefined
mock.module('fs/promises', {
  namedExports: {
    ...fileSystem,
    mkdtemp: async (prefix: string) => {
      if (creationGate !== undefined) {
        onCreation?.()
        await creationGate
      }
      const directory = await nativeMkdtemp(prefix)
      createdDirectory = directory
      return directory
    },
    lstat: async (path: string) => {
      if (failInitialStat && path === createdDirectory) {
        failInitialStat = false
        throw failure
      }
      return nativeLstat(path)
    },
    rm: async (path: string, options: Parameters<typeof nativeRm>[1]) => {
      await nativeRm(path, options)
      if (path === createdDirectory) {
        onDisposal?.()
      }
    },
  },
})
describe('assisted planner instruction setup ownership', () => {
  it('cancels a stalled filesystem setup promptly and cleans late-created ownership', async t => {
    const {
      createMockPlanner,
      deferred,
      makeCopilotAccount,
      syntheticAnalysis,
      syntheticBYOKRequest,
      assertPlanningError,
    } = await import('../helpers/copilot-assisted-commit')
    const gate = deferred<void>()
    const started = deferred<void>()
    const disposed = deferred<void>()
    creationGate = gate.promise
    onCreation = () => started.resolve()
    onDisposal = () => disposed.resolve()
    const planner = createMockPlanner(t)
    const controller = new AbortController()
    let failure: unknown
    const operation = planner.store
      .proposeAssistedCommitPlan(
        makeCopilotAccount(),
        syntheticAnalysis,
        '/synthetic/repository',
        { request: syntheticBYOKRequest(), signal: controller.signal }
      )
      .catch(error => {
        failure = error
      })
    await started.promise
    controller.abort()
    await setImmediate()
    try {
      assert.strictEqual(planner.forceStop.mock.callCount(), 1)
      assertPlanningError('cancelled')(failure)
      assert.strictEqual(planner.createSession.mock.callCount(), 0)
    } finally {
      gate.resolve()
      await operation
      await disposed.promise
      creationGate = undefined
      onCreation = undefined
      onDisposal = undefined
    }
    assert.ok(createdDirectory)
    await assert.rejects(access(createdDirectory), /ENOENT/)
  })

  it('removes its still-empty directory when initial ownership lookup fails', async () => {
    const { createAssistedCommitInstructionScope } = await import(
      '../../src/lib/copilot-assisted-commit-instructions'
    )
    failInitialStat = true
    await assert.rejects(
      createAssistedCommitInstructionScope(
        { directory: '/synthetic/home/.copilot', sources: [] },
        { cancellationError: () => new Error('cancelled') }
      ),
      error => error === failure
    )
    assert.ok(createdDirectory)
    try {
      await assert.rejects(
        access(createdDirectory),
        error =>
          error instanceof Error && 'code' in error && error.code === 'ENOENT'
      )
    } finally {
      // A failing-first implementation must not leave this test's empty resource.
      await fileSystem.rmdir(createdDirectory).catch(error => {
        assert.ok(
          error instanceof Error && 'code' in error && error.code === 'ENOENT'
        )
      })
    }
  })
})
