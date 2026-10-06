import type {
  AssistantMessageEvent,
  MessageOptions,
  SessionConfig,
  SessionEventPayload,
} from '@github/copilot-sdk'
import type {
  InstructionSource,
  Model,
} from '@github/copilot-sdk/dist/generated/rpc'
import { TestContext } from 'node:test'
import { Account } from '../../src/models/account'
import {
  IAssistedCommitAnalysis,
  IAssistedCommitPlanCommit,
} from '../../src/models/assisted-commit'
import {
  CopilotAssistedCommitResponse,
  CopilotAssistedCommitError,
  CopilotAssistedCommitErrorCode,
} from '../../src/lib/copilot-assisted-commit'
import {
  ICopilotPlanningClient,
  ICopilotPlanningSession,
  ICopilotGlobalInstructions,
} from '../../src/lib/copilot-operation'
import { getDotComAPIEndpoint } from '../../src/lib/api'
import {
  CopilotModelRequest,
  CopilotStore,
} from '../../src/lib/stores/copilot-store'
import { createTestAccountsStore } from './app-store-test-harness'
import assert from 'node:assert'

export const syntheticAnalysis: IAssistedCommitAnalysis = {
  snapshotId: 'synthetic-snapshot',
  changes: [
    {
      id: 'opaque-first-hunk',
      kind: 'text-hunk',
      path: 'feature.ts',
      diff: '@@ -1 +1 @@\n-old first\n+selected first\n',
    },
    {
      id: 'opaque-second-hunk',
      kind: 'text-hunk',
      path: 'feature.ts',
      diff: '@@ -20 +20 @@\n-old second\n+selected second\n',
    },
    {
      id: 'opaque-atomic-rename',
      kind: 'atomic',
      path: 'renamed.bin',
      oldPath: 'original.bin',
      diff: 'rename from original.bin\nrename to renamed.bin\nBinary files differ\n',
    },
  ],
}

export function makeCopilotAccount(): Account {
  return new Account(
    'monalisa',
    getDotComAPIEndpoint(),
    'synthetic-token',
    [],
    '',
    1,
    'Monalisa',
    'free',
    undefined,
    true,
    ['desktop_copilot_generate_commit_message'],
    'PRO'
  )
}

export function syntheticBYOKRequest(timeoutMs?: number): CopilotModelRequest {
  return {
    kind: 'byok',
    modelId: 'synthetic-model',
    provider: {
      type: 'openai',
      baseUrl: 'http://127.0.0.1:1',
      wireApi: 'completions',
    },
    reasoningEffort: 'high',
    timeoutMs,
  }
}

export function wholeSelectionResponse(
  analysis: IAssistedCommitAnalysis = syntheticAnalysis,
  title = 'Summarize the entire selection'
): CopilotAssistedCommitResponse {
  return {
    kind: 'plan',
    snapshotId: analysis.snapshotId,
    commits: [{ title, changeIds: analysis.changes.map(change => change.id) }],
  }
}

export function splitResponse(
  analysis: IAssistedCommitAnalysis = syntheticAnalysis
): CopilotAssistedCommitResponse {
  const commits: IAssistedCommitPlanCommit[] = analysis.changes.map(
    (change, index) => ({
      title: `Describe selected unit ${index + 1}`,
      changeIds: [change.id],
    })
  )
  return { kind: 'plan', snapshotId: analysis.snapshotId, commits }
}

export function assertPlanningError(
  code: CopilotAssistedCommitErrorCode
): (error: unknown) => boolean {
  return error => {
    assert.ok(error instanceof CopilotAssistedCommitError)
    assert.strictEqual(error.code, code)
    return true
  }
}

export function deferred<T>() {
  let resolveValue: ((value: T) => void) | undefined
  let rejectValue: ((error: unknown) => void) | undefined
  const promise = new Promise<T>((resolve, reject) => {
    resolveValue = resolve
    rejectValue = reject
  })
  assert.ok(resolveValue && rejectValue)
  return { promise, resolve: resolveValue, reject: rejectValue }
}

export function assistantMessage(content: string): AssistantMessageEvent {
  return {
    type: 'assistant.message',
    id: 'synthetic-message',
    timestamp: new Date(0).toISOString(),
    parentId: null,
    data: { messageId: 'synthetic-message', content },
  }
}

export function createPlannerStore(
  factory: (
    account: Account,
    repositoryPath: string
  ) => Promise<ICopilotPlanningClient>
): CopilotStore {
  return new (class extends CopilotStore {
    protected override createAssistedCommitClient(
      account: Account,
      repositoryPath: string
    ): Promise<ICopilotPlanningClient> {
      return factory(account, repositoryPath)
    }
  })(createTestAccountsStore())
}

export function createMockPlanner(t: TestContext) {
  const errors = new Set<
    (data: SessionEventPayload<'session.error'>['data']) => void
  >()
  const send = t.mock.fn(
    async (
      _options: MessageOptions
    ): Promise<AssistantMessageEvent | undefined> =>
      assistantMessage(JSON.stringify(wholeSelectionResponse()))
  )
  const disconnect = t.mock.fn(async () => {})
  const getInstructionSources = t.mock.fn(
    async (): Promise<ReadonlyArray<InstructionSource>> => []
  )
  const messages = new Set<(event: AssistantMessageEvent) => void>()
  const idle = new Set<() => void>()
  const session: ICopilotPlanningSession = {
    getInstructionSources,
    onSessionError: handler => {
      errors.add(handler)
      return () => errors.delete(handler)
    },
    sendAndWait: send,
    onAssistantMessage: handler => {
      messages.add(handler)
      return () => messages.delete(handler)
    },
    onIdle: handler => {
      idle.add(handler)
      return () => idle.delete(handler)
    },
    send: async options => {
      const response = await send(options)
      if (response !== undefined) {
        messages.forEach(handler => handler(response))
      }
      idle.forEach(handler => handler())
      return 'synthetic-message'
    },
    disconnect,
  }
  const createSession = t.mock.fn(async (_config: SessionConfig) => session)
  const stop = t.mock.fn(async (): Promise<ReadonlyArray<Error>> => [])
  const forceStop = t.mock.fn(async () => {})
  const getGlobalInstructions = t.mock.fn(
    async (): Promise<ICopilotGlobalInstructions> => ({
      directory: '/synthetic/home/.copilot',
      sources: [],
    })
  )
  const client: ICopilotPlanningClient = {
    getGlobalInstructions,
    createSession,
    stop,
    forceStop,
  }
  const createClient = t.mock.fn(
    async (_account: Account, _repositoryPath: string) => client
  )
  const store = createPlannerStore(createClient)
  const listModels = t.mock.method(
    store,
    'listModels',
    async (): Promise<ReadonlyArray<Model> | null> => []
  )
  const cachedModels = t.mock.method(
    store,
    'getCachedModelList',
    (): ReadonlyArray<Model> | null => []
  )
  return {
    store,
    client,
    session,
    send,
    disconnect,
    createSession,
    createClient,
    stop,
    forceStop,
    listModels,
    cachedModels,
    getGlobalInstructions,
    getInstructionSources,
    emitError: (data: SessionEventPayload<'session.error'>['data']) =>
      errors.forEach(handler => handler(data)),
    listenerCount: () => errors.size + messages.size + idle.size,
  }
}
