import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type {
  CopilotClientOptions,
  SessionConfig,
  SessionEvent,
  SessionFsProvider,
} from '@github/copilot-sdk'
import { CopilotClient } from '../../src/lib/copilot/sdk-client'
import {
  ICopilotSdkModule,
  serveCopilotSdkConnection,
} from '../../src/lib/copilot/sdk-host'
import { getCopilotInMemorySessionFsConfig } from '../../src/lib/copilot-in-memory-session-fs-provider'
import { createCopilotSdkChannelPair } from '../helpers/copilot-sdk-host'

const assistantEvent = {
  type: 'assistant.message',
  data: { content: 'Hello' },
}

/** A minimal stand-in for the SDK's session. */
class FakeSession {
  public readonly fileSystems = new Array<SessionFsProvider>()
  public disconnects = 0
  public readonly rpc = {
    tools: { getCurrentMetadata: async () => ({ tools: [] }) },
  }
  private readonly handlers = new Set<(event: unknown) => void>()

  public constructor(
    public readonly sessionId: string,
    private readonly hang: boolean
  ) {}

  public on(handler: (event: unknown) => void) {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  public async send() {
    if (this.hang) {
      return new Promise<string>(() => {})
    }
    for (const handler of this.handlers) {
      handler(assistantEvent)
    }
    return 'message-id'
  }

  public async disconnect() {
    this.disconnects++
  }
}

/** A minimal stand-in for the SDK's client. */
class FakeClient {
  public static readonly instances = new Array<FakeClient>()
  public readonly sessions = new Array<FakeSession>()
  public stops = 0

  public readonly rpc = {
    account: { getQuota: async () => ({ remaining: 42 }) },
  }

  public constructor(
    private readonly options: CopilotClientOptions & { hang?: boolean } = {}
  ) {
    FakeClient.instances.push(this)
  }

  public async listModels() {
    return this.options.onListModels?.()
  }

  public async ping() {
    throw Object.assign(new Error('Runtime unavailable'), {
      code: 'E_RUNTIME',
    })
  }

  public async createSession(config: SessionConfig) {
    const session = new FakeSession(
      `session-${this.sessions.length}`,
      this.options.hang === true
    )
    const fs = config.createSessionFsProvider?.(
      session as unknown as Parameters<
        NonNullable<SessionConfig['createSessionFsProvider']>
      >[0]
    )
    if (fs !== undefined) {
      session.fileSystems.push(fs)
    }
    this.sessions.push(session)
    return session
  }

  public async forceStop() {
    this.stops++
  }

  public async stop() {
    this.stops++
    return []
  }
}

const fakeSdk = { CopilotClient: FakeClient } as unknown as ICopilotSdkModule

function createClient(options: CopilotClientOptions & { hang?: boolean } = {}) {
  const { client, host } = createCopilotSdkChannelPair()
  const served = serveCopilotSdkConnection(host, fakeSdk)
  const proxy = new CopilotClient(options, async () => client)
  return { proxy, host, served }
}

const sessionFs = getCopilotInMemorySessionFsConfig('/repository', 'posix')

describe('Copilot SDK host', () => {
  it('forwards calls, RPC paths and callbacks to the SDK', async () => {
    const { proxy } = createClient({
      onListModels: () => [
        {
          id: 'model',
          name: 'Model',
          capabilities: {
            supports: { vision: false, reasoningEffort: false },
            limits: { max_context_window_tokens: 1 },
          },
        },
      ],
    })

    const models = await proxy.listModels()
    assert.deepEqual(
      models.map(model => model.id),
      ['model']
    )
    assert.deepEqual(await proxy.rpc.account.getQuota({}), { remaining: 42 })
    await proxy.forceStop()
  })

  it('delivers session events before the result of the call that caused them', async () => {
    const { proxy } = createClient()
    const session = await proxy.createSession({})
    const events = new Array<SessionEvent>()
    session.on(event => events.push(event))

    assert.equal(await session.send({ prompt: 'Hi' }), 'message-id')
    assert.deepEqual(events, [assistantEvent])
    await proxy.forceStop()
  })

  it('preserves error messages and codes', async () => {
    const { proxy } = createClient()

    await assert.rejects(proxy.ping(), {
      message: 'Runtime unavailable',
      code: 'E_RUNTIME',
    })
    await proxy.forceStop()
  })

  it('disposes in-memory session filesystems on disconnect and on close', async () => {
    const { proxy, served } = createClient({ sessionFs })
    const disconnected = await proxy.createSession({})
    const open = await proxy.createSession({})
    const [first, second] = FakeClient.instances.at(-1)?.sessions ?? []
    assert.equal(first.fileSystems.length, 1)
    assert.equal(second.fileSystems.length, 1)

    await disconnected.disconnect()
    assert.equal(first.disconnects, 1)
    await assert.rejects(first.fileSystems[0].exists('state'), /disposed/)
    assert.equal(await second.fileSystems[0].exists('/missing'), false)

    await proxy.stop()
    await served
    await assert.rejects(second.fileSystems[0].exists('state'), /disposed/)
    // stop() is idempotent, like the SDK's.
    assert.deepEqual(await proxy.stop(), [])
    await proxy.forceStop()
    await assert.rejects(open.send({ prompt: 'Late' }), /disconnected/)
  })

  it('rejects pending calls and force stops the SDK when the host goes away', async () => {
    const { proxy, host, served } = createClient({ hang: true })
    const session = await proxy.createSession({})
    const pending = session.send({ prompt: 'Hi' })

    host.close()
    await assert.rejects(pending, /disconnected/)
    await served
    assert.equal(FakeClient.instances.at(-1)?.stops, 1)
  })
})
