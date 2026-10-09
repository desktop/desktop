import assert from 'node:assert'
import { setImmediate } from 'node:timers/promises'
import { access, readFile } from 'fs/promises'
import { join } from 'path'
import { describe, it } from 'node:test'
import type { Model } from '@github/copilot-sdk/dist/generated/rpc'
import {
  AssistedCommitCleanupTimeoutMs,
  CopilotStore,
  DefaultCopilotRequestTimeoutMs,
} from '../../../src/lib/stores/copilot-store'
import { CopilotError } from '../../../src/lib/copilot-error'
import {
  AssistedCommitPromptLimitBytes,
  CopilotAssistedCommitError,
} from '../../../src/lib/copilot-assisted-commit'
import { ICopilotPlanningClient } from '../../../src/lib/copilot-operation'
import { enableCommitMessageGeneration } from '../../../src/lib/feature-flag'
import {
  assistantMessage,
  assertPlanningError,
  createMockPlanner,
  deferred,
  makeCopilotAccount,
  syntheticAnalysis,
  syntheticBYOKRequest,
  wholeSelectionResponse,
} from '../../helpers/copilot-assisted-commit'
import { createTestAccountsStore } from '../../helpers/app-store-test-harness'
import { Account } from '../../../src/models/account'

const account = makeCopilotAccount()
const repositoryPath = '/synthetic/repository'

function makeModel(
  id: string,
  supportsEffort: boolean,
  efforts?: string[]
): Model {
  return {
    id,
    name: id,
    capabilities: {
      supports: { reasoningEffort: supportsEffort, vision: false },
      limits: { max_context_window_tokens: 128000 },
    },
    supportedReasoningEfforts: efforts,
  }
}

describe('CopilotStore constrained assisted planner', () => {
  it('uses only snapshot analysis and caller BYOK selection without metadata lookup or draft updates', async t => {
    const mock = createMockPlanner(t)
    const scheduled = t.mock.method(globalThis, 'setTimeout')
    const request = syntheticBYOKRequest(12345)
    const response = await mock.store.proposeAssistedCommitPlan(
      account,
      syntheticAnalysis,
      repositoryPath,
      { request }
    )
    assert.deepStrictEqual(response, wholeSelectionResponse())
    assert.strictEqual(mock.listModels.mock.callCount(), 0)
    assert.deepStrictEqual(mock.createClient.mock.calls[0].arguments, [
      account,
      repositoryPath,
    ])
    const config = mock.createSession.mock.calls[0].arguments[0]
    assert.strictEqual(config.model, request.modelId)
    if (request.kind === 'byok') {
      assert.strictEqual(config.provider, request.provider)
      assert.strictEqual(config.reasoningEffort, request.reasoningEffort)
    }
    assert.strictEqual(config.coauthorEnabled, false)
    assert.strictEqual(config.enableSessionStore, false)
    assert.strictEqual(config.systemMessage?.mode, 'append')
    assert.strictEqual(config.workingDirectory, repositoryPath)
    assert.strictEqual(typeof config.createSessionFsProvider, 'function')
    assert.ok(scheduled.mock.calls.some(call => call.arguments[1] === 12345))
    const prompt = mock.send.mock.calls[0].arguments[0].prompt
    assert.ok(prompt.includes('opaque-first-hunk'))
    assert.ok(prompt.includes('opaque-second-hunk'))
    assert.ok(prompt.includes('opaque-atomic-rename'))
    assert.ok(!prompt.includes('privateIndex'))
    assert.strictEqual(mock.disconnect.mock.callCount(), 1)
    assert.strictEqual(mock.stop.mock.callCount(), 1)
    assert.strictEqual(mock.forceStop.mock.callCount(), 0)
    assert.strictEqual(mock.listenerCount(), 0)
  })

  for (const [supports, efforts] of [
    [true, ['low', 'medium', 'high']],
    [true, ['medium', 'high']],
    [false, ['low']],
    [true, undefined],
  ] as const) {
    it(`leaves built-in reasoning effort at the SDK default (supports=${supports}, efforts=${efforts})`, async t => {
      const mock = createMockPlanner(t)
      mock.cachedModels.mock.mockImplementation(() => [
        makeModel(
          'chosen-model',
          supports,
          efforts === undefined ? undefined : [...efforts]
        ),
        makeModel('other-model', false),
      ])
      for (const mode of ['plan', 'single-commit'] as const) {
        await mock.store.proposeAssistedCommitPlan(
          account,
          syntheticAnalysis,
          repositoryPath,
          {
            request: { kind: 'copilot', modelId: 'chosen-model' },
            mode,
          }
        )
      }
      for (const call of mock.createSession.mock.calls) {
        const config = call.arguments[0]
        assert.strictEqual(config.model, 'chosen-model')
        assert.strictEqual(config.reasoningEffort, undefined)
        assert.strictEqual(config.provider, undefined)
      }
      assert.strictEqual(mock.createSession.mock.callCount(), 2)
      assert.strictEqual(mock.listModels.mock.callCount(), 0)
    })
  }

  it('keeps a reasoning-capable preferred default model without overriding its SDK effort default', async t => {
    const mock = createMockPlanner(t)
    mock.cachedModels.mock.mockImplementation(() => [
      makeModel('preferred-model', true, ['low', 'medium', 'high']),
    ])
    await mock.store.proposeAssistedCommitPlan(
      account,
      syntheticAnalysis,
      repositoryPath
    )
    const config = mock.createSession.mock.calls[0].arguments[0]
    assert.strictEqual(config.model, 'preferred-model')
    assert.strictEqual(config.reasoningEffort, undefined)
  })

  it('preserves an absent BYOK reasoning effort without inventing an override', async t => {
    const mock = createMockPlanner(t)
    const request = syntheticBYOKRequest()
    assert.ok(request.kind === 'byok')
    await mock.store.proposeAssistedCommitPlan(
      account,
      syntheticAnalysis,
      repositoryPath,
      { request: { ...request, reasoningEffort: undefined } }
    )
    const config = mock.createSession.mock.calls[0].arguments[0]
    assert.strictEqual(config.model, request.modelId)
    assert.strictEqual(config.provider, request.provider)
    assert.strictEqual(config.reasoningEffort, undefined)
    assert.strictEqual(mock.cachedModels.mock.callCount(), 0)
    assert.strictEqual(mock.listModels.mock.callCount(), 0)
  })

  it('preserves a configured built-in model and default effort when cached metadata is absent', async t => {
    const mock = createMockPlanner(t)
    mock.cachedModels.mock.mockImplementation(() => null)
    await mock.store.proposeAssistedCommitPlan(
      account,
      syntheticAnalysis,
      repositoryPath,
      { request: { kind: 'copilot', modelId: 'configured-model' } }
    )
    const config = mock.createSession.mock.calls[0].arguments[0]
    assert.strictEqual(config.model, 'configured-model')
    assert.strictEqual(config.reasoningEffort, undefined)
    assert.strictEqual(mock.listModels.mock.callCount(), 0)
  })

  it('keeps an explicitly selected unknown model rather than silently downgrading or inventing effort', async t => {
    const mock = createMockPlanner(t)
    mock.cachedModels.mock.mockImplementation(() => [
      makeModel('other', true, ['low']),
    ])
    await mock.store.proposeAssistedCommitPlan(
      account,
      syntheticAnalysis,
      repositoryPath,
      {
        request: { kind: 'copilot', modelId: 'configured-but-not-cached' },
      }
    )
    const config = mock.createSession.mock.calls[0].arguments[0]
    assert.strictEqual(config.model, 'configured-but-not-cached')
    assert.strictEqual(config.reasoningEffort, undefined)
  })

  it('never starts a shared metadata fetch while planning with a cold cache', async t => {
    const mock = createMockPlanner(t)
    mock.listModels.mock.mockImplementation(() => new Promise<never>(() => {}))
    const controller = new AbortController()
    const operation = mock.store.proposeAssistedCommitPlan(
      account,
      syntheticAnalysis,
      repositoryPath,
      {
        request: { kind: 'copilot', modelId: 'configured-model' },
        signal: controller.signal,
      }
    )
    await setImmediate()
    controller.abort()
    await operation.catch(error => {
      assertPlanningError('cancelled')(error)
    })
    assert.strictEqual(mock.listModels.mock.callCount(), 0)
  })

  it('reuses the existing default model preference and never sends auto reasoning effort', async t => {
    const mock = createMockPlanner(t)
    const scheduled = t.mock.method(globalThis, 'setTimeout')
    mock.cachedModels.mock.mockImplementation(() => [
      makeModel('auto', true, ['low']),
      makeModel('expensive', true, ['high']),
    ])
    await mock.store.proposeAssistedCommitPlan(
      account,
      syntheticAnalysis,
      repositoryPath
    )
    const config = mock.createSession.mock.calls[0].arguments[0]
    assert.strictEqual(config.model, 'auto')
    assert.strictEqual(config.reasoningEffort, undefined)
    assert.ok(
      scheduled.mock.calls.some(
        call => call.arguments[1] === DefaultCopilotRequestTimeoutMs
      )
    )
  })

  it('does no metadata/client/session/model work for empty selections, including allow-empty integration usage', async t => {
    const mock = createMockPlanner(t)
    await assert.rejects(
      mock.store.proposeAssistedCommitPlan(
        account,
        { snapshotId: 'empty', changes: [] },
        repositoryPath
      ),
      assertPlanningError('empty-selection')
    )
    assert.strictEqual(mock.listModels.mock.callCount(), 0)
    assert.strictEqual(mock.createClient.mock.callCount(), 0)
    assert.strictEqual(mock.createSession.mock.callCount(), 0)
    assert.strictEqual(mock.send.mock.callCount(), 0)
  })

  it('fails before setup rather than truncating an oversized selected prompt', async t => {
    const mock = createMockPlanner(t)
    await assert.rejects(
      mock.store.proposeAssistedCommitPlan(
        account,
        {
          snapshotId: 'large',
          changes: [
            {
              id: 'opaque',
              path: 'file',
              kind: 'text-hunk',
              diff: 'x'.repeat(AssistedCommitPromptLimitBytes),
            },
          ],
        },
        repositoryPath
      ),
      assertPlanningError('prompt-too-large')
    )
    assert.strictEqual(mock.createClient.mock.callCount(), 0)
    assert.strictEqual(mock.listModels.mock.callCount(), 0)
  })

  for (const timeoutMs of [0, -1, Infinity, NaN, 2147483648]) {
    it(`rejects invalid configured timeout ${timeoutMs} without silently defaulting`, async t => {
      const mock = createMockPlanner(t)
      await assert.rejects(
        mock.store.proposeAssistedCommitPlan(
          account,
          syntheticAnalysis,
          repositoryPath,
          {
            request: syntheticBYOKRequest(timeoutMs),
          }
        ),
        assertPlanningError('invalid-request')
      )
      assert.strictEqual(mock.createClient.mock.callCount(), 0)
    })
  }

  it('rejects missing account authentication through the existing client factory', async () => {
    const store = new CopilotStore(createTestAccountsStore())
    await assert.rejects(
      store.proposeAssistedCommitPlan(
        account.withToken(''),
        syntheticAnalysis,
        repositoryPath,
        {
          request: syntheticBYOKRequest(),
        }
      ),
      /Cannot create Copilot client: Account has no token/
    )
  })

  it('retains the existing feature and organization entitlement gate for layer 4 callers', () => {
    assert.strictEqual(enableCommitMessageGeneration(account), true)
    const disabled = new Account(
      account.login,
      account.endpoint,
      account.token,
      [],
      '',
      account.id,
      account.name,
      'free',
      undefined,
      false,
      account.features,
      'NO_ACCESS'
    )
    assert.strictEqual(enableCommitMessageGeneration(disabled), false)
  })

  it('cancels before any setup when already aborted', async t => {
    const mock = createMockPlanner(t)
    const controller = new AbortController()
    controller.abort()
    await assert.rejects(
      mock.store.proposeAssistedCommitPlan(
        account,
        syntheticAnalysis,
        repositoryPath,
        { signal: controller.signal }
      ),
      assertPlanningError('cancelled')
    )
    assert.strictEqual(mock.listModels.mock.callCount(), 0)
    assert.strictEqual(mock.createClient.mock.callCount(), 0)
  })

  it('observes cancellation while reading cached model metadata without starting an RPC', async t => {
    const mock = createMockPlanner(t)
    const controller = new AbortController()
    mock.cachedModels.mock.mockImplementation(() => {
      controller.abort()
      return []
    })
    const operation = mock.store.proposeAssistedCommitPlan(
      account,
      syntheticAnalysis,
      repositoryPath,
      { signal: controller.signal }
    )
    await assert.rejects(operation, assertPlanningError('cancelled'))
    assert.strictEqual(mock.createClient.mock.callCount(), 0)
    assert.strictEqual(mock.listModels.mock.callCount(), 0)
  })

  it('cancels pending client setup and disposes a late-created client', async t => {
    const mock = createMockPlanner(t)
    const creation = deferred<ICopilotPlanningClient>()
    const started = deferred<void>()
    mock.createClient.mock.mockImplementation(() => {
      started.resolve()
      return creation.promise
    })
    const controller = new AbortController()
    const operation = mock.store.proposeAssistedCommitPlan(
      account,
      syntheticAnalysis,
      repositoryPath,
      {
        request: syntheticBYOKRequest(),
        signal: controller.signal,
      }
    )
    await started.promise
    controller.abort()
    await assert.rejects(operation, assertPlanningError('cancelled'))
    assert.strictEqual(mock.createSession.mock.callCount(), 0)
    creation.resolve(mock.client)
    await setImmediate()
    assert.strictEqual(mock.forceStop.mock.callCount(), 1)
  })

  it('cancels pending SDK global instruction discovery before creating a session', async t => {
    const mock = createMockPlanner(t)
    const discovery =
      deferred<Awaited<ReturnType<typeof mock.client.getGlobalInstructions>>>()
    const started = deferred<void>()
    mock.getGlobalInstructions.mock.mockImplementation(() => {
      started.resolve()
      return discovery.promise
    })
    const controller = new AbortController()
    const operation = mock.store.proposeAssistedCommitPlan(
      account,
      syntheticAnalysis,
      repositoryPath,
      {
        request: syntheticBYOKRequest(),
        signal: controller.signal,
      }
    )
    await started.promise
    controller.abort()
    await assert.rejects(operation, assertPlanningError('cancelled'))
    assert.strictEqual(mock.forceStop.mock.callCount(), 1)
    assert.strictEqual(mock.createSession.mock.callCount(), 0)
    discovery.resolve({ directory: '/synthetic/home/.copilot', sources: [] })
    await setImmediate()
    assert.strictEqual(mock.createSession.mock.callCount(), 0)
  })

  it('supplies only SDK-discovered instructions in an owned config and removes it on success', async t => {
    const mock = createMockPlanner(t)
    const content = 'Global commit message instructions'
    mock.getGlobalInstructions.mock.mockImplementation(async () => ({
      directory: '/synthetic/home/.copilot',
      sources: [
        {
          id: 'home-copilot',
          label: 'Global',
          sourcePath: '/synthetic/home/.copilot/copilot-instructions.md',
          content,
          type: 'home',
          location: 'user',
        },
      ],
    }))
    let configDirectory: string | undefined
    mock.createSession.mock.mockImplementation(async config => {
      assert.ok(config.configDirectory)
      configDirectory = config.configDirectory
      assert.strictEqual(
        await readFile(
          join(config.configDirectory, 'copilot-instructions.md'),
          'utf8'
        ),
        content
      )
      return mock.session
    })
    await mock.store.proposeAssistedCommitPlan(
      account,
      syntheticAnalysis,
      repositoryPath,
      { request: syntheticBYOKRequest() }
    )
    assert.ok(configDirectory)
    await assert.rejects(access(configDirectory), /ENOENT/)
  })

  it('force-stops pending session setup and disconnects any late-created session once', async t => {
    const mock = createMockPlanner(t)
    const creation = deferred<typeof mock.session>()
    const started = deferred<void>()
    mock.createSession.mock.mockImplementation(() => {
      started.resolve()
      return creation.promise
    })
    const controller = new AbortController()
    const operation = mock.store.proposeAssistedCommitPlan(
      account,
      syntheticAnalysis,
      repositoryPath,
      {
        request: syntheticBYOKRequest(),
        signal: controller.signal,
      }
    )
    await started.promise
    controller.abort()
    await assert.rejects(operation, assertPlanningError('cancelled'))
    assert.strictEqual(mock.forceStop.mock.callCount(), 1)
    assert.strictEqual(mock.send.mock.callCount(), 0)
    creation.resolve(mock.session)
    await setImmediate()
    assert.strictEqual(mock.disconnect.mock.callCount(), 1)
  })

  it('cancels pending scoped instruction metadata without sending a prompt or retaining config', async t => {
    const mock = createMockPlanner(t)
    const metadata =
      deferred<Awaited<ReturnType<typeof mock.session.getInstructionSources>>>()
    const started = deferred<void>()
    mock.getInstructionSources.mock.mockImplementation(() => {
      started.resolve()
      return metadata.promise
    })
    const controller = new AbortController()
    const operation = mock.store.proposeAssistedCommitPlan(
      account,
      syntheticAnalysis,
      repositoryPath,
      {
        request: syntheticBYOKRequest(),
        signal: controller.signal,
      }
    )
    await started.promise
    const config = mock.createSession.mock.calls[0].arguments[0]
    assert.ok(config.configDirectory)
    controller.abort()
    await assert.rejects(operation, assertPlanningError('cancelled'))
    assert.strictEqual(mock.send.mock.callCount(), 0)
    assert.strictEqual(mock.forceStop.mock.callCount(), 1)
    await assert.rejects(access(config.configDirectory), /ENOENT/)
    metadata.resolve([])
  })

  it('cancels during a request, releases listeners and tears down the owned runtime', async t => {
    const mock = createMockPlanner(t)
    const started = deferred<void>()
    mock.send.mock.mockImplementation(() => {
      started.resolve()
      return new Promise<never>(() => {})
    })
    const controller = new AbortController()
    const operation = mock.store.proposeAssistedCommitPlan(
      account,
      syntheticAnalysis,
      repositoryPath,
      {
        request: syntheticBYOKRequest(),
        signal: controller.signal,
      }
    )
    await started.promise
    controller.abort()
    await assert.rejects(operation, assertPlanningError('cancelled'))
    assert.strictEqual(mock.listenerCount(), 0)
    assert.strictEqual(mock.forceStop.mock.callCount(), 1)
    assert.strictEqual(mock.stop.mock.callCount(), 0)
  })

  it('does not return a plan after cancellation during cleanup', async t => {
    const mock = createMockPlanner(t)
    const started = deferred<void>()
    const cleanup = deferred<ReadonlyArray<Error>>()
    mock.stop.mock.mockImplementation(() => {
      started.resolve()
      return cleanup.promise
    })
    const controller = new AbortController()
    const operation = mock.store.proposeAssistedCommitPlan(
      account,
      syntheticAnalysis,
      repositoryPath,
      {
        request: syntheticBYOKRequest(),
        signal: controller.signal,
      }
    )
    await started.promise
    controller.abort()
    cleanup.resolve([])
    await assert.rejects(operation, assertPlanningError('cancelled'))
  })

  it('times out during setup/request without returning a plan or retrying', async t => {
    const mock = createMockPlanner(t)
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const started = deferred<void>()
    mock.send.mock.mockImplementation(() => {
      started.resolve()
      return new Promise<never>(() => {})
    })
    const operation = mock.store.proposeAssistedCommitPlan(
      account,
      syntheticAnalysis,
      repositoryPath,
      {
        request: syntheticBYOKRequest(25),
      }
    )
    await started.promise
    t.mock.timers.tick(25)
    await assert.rejects(operation, assertPlanningError('timed-out'))
    assert.strictEqual(mock.createSession.mock.callCount(), 1)
    assert.strictEqual(mock.forceStop.mock.callCount(), 1)
    assert.strictEqual(mock.listenerCount(), 0)
  })

  for (const failure of [
    new Error('401 authentication failed'),
    new Error('provider timeout'),
    new Error('context window exceeded'),
  ]) {
    it(`preserves transport failure "${failure.message}" without manufacturing success`, async t => {
      const mock = createMockPlanner(t)
      mock.send.mock.mockImplementation(async () => {
        throw failure
      })
      await assert.rejects(
        mock.store.proposeAssistedCommitPlan(
          account,
          syntheticAnalysis,
          repositoryPath,
          { request: syntheticBYOKRequest() }
        ),
        error => error === failure
      )
      assert.strictEqual(mock.send.mock.callCount(), 1)
      assert.strictEqual(mock.disconnect.mock.callCount(), 1)
      assert.strictEqual(mock.stop.mock.callCount(), 1)
    })
  }

  it('retains 402 billing metadata instead of the SDK generic rejection', async t => {
    const mock = createMockPlanner(t)
    mock.send.mock.mockImplementation(async () => {
      mock.emitError({
        errorType: 'quota',
        statusCode: 402,
        errorCode: 'quota_exceeded',
        message: '402 Copilot quota exhausted (Request ID: synthetic)',
      })
      throw new Error('Generic SDK failure')
    })
    await assert.rejects(
      mock.store.proposeAssistedCommitPlan(
        account,
        syntheticAnalysis,
        repositoryPath,
        { request: syntheticBYOKRequest() }
      ),
      error => {
        assert.ok(error instanceof CopilotError)
        assert.strictEqual(error.isPaymentRequiredError, true)
        assert.strictEqual(error.code, 'quota_exceeded')
        assert.strictEqual(error.message, 'Copilot quota exhausted')
        return true
      }
    )
    assert.strictEqual(mock.send.mock.callCount(), 1)
  })

  it('rejects a 402 session error even if the SDK returns success-shaped content', async t => {
    const mock = createMockPlanner(t)
    mock.send.mock.mockImplementation(async () => {
      mock.emitError({
        errorType: 'quota',
        statusCode: 402,
        errorCode: 'quota_exceeded',
        message: '402 Quota exhausted',
      })
      return assistantMessage(JSON.stringify(wholeSelectionResponse()))
    })
    await assert.rejects(
      mock.store.proposeAssistedCommitPlan(
        account,
        syntheticAnalysis,
        repositoryPath,
        { request: syntheticBYOKRequest() }
      ),
      error => error instanceof CopilotError && error.code === 'quota_exceeded'
    )
  })

  it('rejects authentication session errors even if the SDK returns success-shaped content', async t => {
    const mock = createMockPlanner(t)
    mock.send.mock.mockImplementation(async () => {
      mock.emitError({
        errorType: 'authentication',
        statusCode: 401,
        message: '401 Authentication failed',
      })
      return assistantMessage(JSON.stringify(wholeSelectionResponse()))
    })
    await assert.rejects(
      mock.store.proposeAssistedCommitPlan(
        account,
        syntheticAnalysis,
        repositoryPath,
        { request: syntheticBYOKRequest() }
      ),
      /401 Authentication failed/
    )
  })

  for (const content of ['{', '{"kind":"ask-user"}', undefined]) {
    it(`rejects malformed or absent response ${content} and cleans up`, async t => {
      const mock = createMockPlanner(t)
      mock.send.mock.mockImplementation(async () =>
        content === undefined ? undefined : assistantMessage(content)
      )
      await assert.rejects(
        mock.store.proposeAssistedCommitPlan(
          account,
          syntheticAnalysis,
          repositoryPath,
          { request: syntheticBYOKRequest() }
        ),
        assertPlanningError('invalid-response')
      )
      assert.strictEqual(mock.send.mock.callCount(), 1)
      assert.strictEqual(mock.disconnect.mock.callCount(), 1)
      assert.strictEqual(mock.stop.mock.callCount(), 1)
    })
  }

  it('does not lose the original request failure under an SDK cleanup error list', async t => {
    const mock = createMockPlanner(t)
    const original = new CopilotError('quota', 402, {
      paymentRequiredErrorCode: 'quota_exceeded',
    })
    const cleanup = new Error('disconnect resource failed')
    mock.send.mock.mockImplementation(async () => {
      throw original
    })
    mock.stop.mock.mockImplementation(async () => [cleanup])
    await assert.rejects(
      mock.store.proposeAssistedCommitPlan(
        account,
        syntheticAnalysis,
        repositoryPath,
        { request: syntheticBYOKRequest() }
      ),
      error => {
        assert.ok(error instanceof CopilotAssistedCommitError)
        assert.strictEqual(error.code, 'cleanup-failed')
        assert.strictEqual(error.cause, original)
        assert.strictEqual(error.cleanupErrors.length, 1)
        assert.ok(error.cleanupErrors[0] instanceof AggregateError)
        assert.deepStrictEqual(error.cleanupErrors[0].errors, [cleanup])
        return true
      }
    )
    assert.strictEqual(mock.forceStop.mock.callCount(), 1)
  })

  it('bounds graceful cleanup and force-stops instead of hanging or returning success', async t => {
    const mock = createMockPlanner(t)
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const started = deferred<void>()
    mock.stop.mock.mockImplementation(() => {
      started.resolve()
      return new Promise<never>(() => {})
    })
    const operation = mock.store.proposeAssistedCommitPlan(
      account,
      syntheticAnalysis,
      repositoryPath,
      { request: syntheticBYOKRequest() }
    )
    await started.promise
    t.mock.timers.tick(AssistedCommitCleanupTimeoutMs)
    await assert.rejects(operation, assertPlanningError('cleanup-failed'))
    assert.strictEqual(mock.forceStop.mock.callCount(), 1)
  })
})
