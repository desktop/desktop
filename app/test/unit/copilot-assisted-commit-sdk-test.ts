import assert from 'node:assert'
import { describe, it } from 'node:test'
import { chmod, mkdir, readFile, readdir, writeFile } from 'fs/promises'
import { join } from 'path'
import {
  CopilotClient,
  CopilotRequestContext,
  CopilotRequestHandler,
  CopilotWebSocketHandler,
  RuntimeConnection,
  SessionFsProvider,
  SessionConfig,
} from '@github/copilot-sdk'
import {
  assertPlanningError,
  createPlannerStore,
  makeCopilotAccount,
  syntheticAnalysis,
  syntheticBYOKRequest,
  wholeSelectionResponse,
} from '../helpers/copilot-assisted-commit'
import { createTempDirectory } from '../helpers/temp'
import { optionalBytes } from '../helpers/assisted-commit'
import { getCopilotPlanningClient } from '../../src/lib/copilot-operation'
import { getCopilotInMemorySessionFsConfig } from '../../src/lib/copilot-in-memory-session-fs-provider'
import { isRecord } from '../../src/lib/is-record'
import {
  CopilotAssistedCommitResponse,
  getAssistedCommitClientEnvironment,
} from '../../src/lib/copilot-assisted-commit'

/** A completely local fake model; no synthetic or customer data reaches a provider. */
class SyntheticModel extends CopilotRequestHandler {
  public readonly requests: string[] = []

  public constructor(private readonly response: CopilotAssistedCommitResponse) {
    super()
  }

  protected override async sendRequest(request: Request): Promise<Response> {
    assert.strictEqual(request.url, 'http://127.0.0.1:1/chat/completions')
    const text = await request.text()
    this.requests.push(text)
    const body: unknown = JSON.parse(text)
    assert.ok(isRecord(body))
    const content = JSON.stringify(this.response)
    if (body.stream !== true) {
      return new Response(
        JSON.stringify({
          id: 'synthetic-completion',
          object: 'chat.completion',
          created: 0,
          model: 'synthetic-model',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 100,
            total_tokens: 200,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }
    const chunks = [
      {
        id: 'synthetic-completion',
        object: 'chat.completion.chunk',
        created: 0,
        model: 'synthetic-model',
        choices: [
          {
            index: 0,
            delta: { role: 'assistant', content },
            finish_reason: null,
          },
        ],
      },
      {
        id: 'synthetic-completion',
        object: 'chat.completion.chunk',
        created: 0,
        model: 'synthetic-model',
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      },
    ]
    return new Response(
      `${chunks
        .map(chunk => `data: ${JSON.stringify(chunk)}\n\n`)
        .join('')}data: [DONE]\n\n`,
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
    )
  }

  protected override async openWebSocket(): Promise<CopilotWebSocketHandler> {
    throw new Error('Synthetic SDK tests prohibit network connections')
  }
}

class PendingSyntheticModel extends CopilotRequestHandler {
  public constructor(private readonly started: () => void) {
    super()
  }

  protected override async sendRequest(
    _request: Request,
    context: CopilotRequestContext
  ): Promise<Response> {
    this.started()
    return new Promise<Response>((_, reject) => {
      context.signal.addEventListener(
        'abort',
        () => reject(new Error('Synthetic request aborted')),
        { once: true }
      )
    })
  }

  protected override async openWebSocket(): Promise<CopilotWebSocketHandler> {
    throw new Error('Synthetic SDK tests prohibit network connections')
  }
}

describe('assisted planner actual SDK instruction and isolation contract', () => {
  it('clears all referenced response/deadline timers when actual SDK request is cancelled', async t => {
    const { deferred } = await import('../helpers/copilot-assisted-commit')
    const root = await createTempDirectory(t)
    const config = join(root, 'config')
    const repositoryPath = join(root, 'repository')
    await mkdir(config)
    await mkdir(repositoryPath)
    const started = deferred<void>()
    const client = new CopilotClient({
      connection: RuntimeConnection.forStdio(),
      workingDirectory: repositoryPath,
      baseDirectory: config,
      env: {
        ...getAssistedCommitClientEnvironment({
          HOME: root,
          COPILOT_HOME: config,
          PATH: process.env.PATH,
        }),
        COPILOT_DISABLE_KEYTAR: '1',
      },
      useLoggedInUser: false,
      logLevel: 'none',
      onListModels: () => [],
      sessionFs: getCopilotInMemorySessionFsConfig(
        repositoryPath,
        __WIN32__ ? 'windows' : 'posix'
      ),
      requestHandler: new PendingSyntheticModel(() => started.resolve()),
    })
    t.after(() => client.forceStop())
    const scheduled = t.mock.method(globalThis, 'setTimeout')
    const cleared = t.mock.method(globalThis, 'clearTimeout')
    const timeoutMs = 2147483647
    t.after(() => {
      for (const call of scheduled.mock.calls) {
        if (call.arguments[1] === timeoutMs) {
          clearTimeout(call.result)
        }
      }
    })
    const controller = new AbortController()
    const store = createPlannerStore(async () =>
      getCopilotPlanningClient(client)
    )
    const request = syntheticBYOKRequest(timeoutMs)
    assert.ok(request.kind === 'byok')
    const operation = store.proposeAssistedCommitPlan(
      makeCopilotAccount(),
      syntheticAnalysis,
      repositoryPath,
      {
        request: { ...request, reasoningEffort: undefined },
        signal: controller.signal,
      }
    )
    await started.promise
    controller.abort()
    await assert.rejects(operation, assertPlanningError('cancelled'))
    const waits = scheduled.mock.calls.filter(
      call => call.arguments[1] === timeoutMs
    )
    assert.ok(waits.length > 0)
    for (const wait of waits) {
      assert.ok(
        cleared.mock.calls.some(call => call.arguments[0] === wait.result),
        'A response/deadline timeout was retained after cancellation'
      )
    }
  })

  it('loads global then repository instructions without discovering configured hooks/MCP/agents or persisting session data', async t => {
    const root = await createTempDirectory(t)
    const home = join(root, 'home')
    const configPath = join(home, '.copilot')
    const repositoryPath = join(root, 'repository')
    await mkdir(configPath, { recursive: true })
    await mkdir(join(repositoryPath, '.github', 'hooks'), { recursive: true })
    await mkdir(join(repositoryPath, '.github', 'agents'), { recursive: true })
    const global =
      'Global commit instructions: use GLOBAL prefix; include Global-trailer: yes.'
    const repo =
      'Repository commit instructions: use REPOSITORY prefix instead of GLOBAL; titles may exceed 50 characters; describe lockfile changes; use two body paragraphs.'
    await writeFile(join(configPath, 'copilot-instructions.md'), global)
    await writeFile(
      join(repositoryPath, '.github', 'copilot-instructions.md'),
      repo
    )
    const scoped =
      '---\napplyTo: "**/*.ts"\n---\nScoped global commit instruction: use a detailed TypeScript message.'
    await mkdir(join(configPath, 'instructions'))
    await writeFile(
      join(configPath, 'instructions', 'commits.instructions.md'),
      scoped
    )
    await mkdir(join(repositoryPath, '.github', 'instructions'))
    await writeFile(
      join(
        repositoryPath,
        '.github',
        'instructions',
        'messages.instructions.md'
      ),
      '---\napplyTo: "**/*.ts"\n---\nScoped repository commit instruction: preserve repository message structure.'
    )
    await writeFile(
      join(repositoryPath, 'unrelated.ts'),
      'PRIVATE UNSELECTED CONTENT MUST NOT REACH MODEL'
    )
    const analysis = {
      ...syntheticAnalysis,
      changes: syntheticAnalysis.changes.map(change => ({
        ...change,
        diff: `${change.diff}\n+literal @unrelated.ts in selected data\n`,
      })),
    }
    const marker = join(root, 'forbidden-execution')
    const script = join(root, 'forbidden-execution.js')
    await writeFile(
      script,
      `require('fs').appendFileSync(${JSON.stringify(
        marker
      )}, process.argv[2] + '\\n')`
    )
    await chmod(script, 0o755)
    await writeFile(
      join(configPath, 'mcp-config.json'),
      JSON.stringify({
        mcpServers: {
          hostile: {
            command: process.execPath,
            args: [script, 'MCP'],
            tools: ['*'],
          },
        },
      })
    )
    await writeFile(
      join(configPath, 'config.json'),
      JSON.stringify({ defaultPermissionMode: 'allow-all' })
    )
    await writeFile(
      join(repositoryPath, '.github', 'hooks', 'hooks.json'),
      JSON.stringify({
        version: 1,
        hooks: {
          sessionStart: [
            {
              type: 'command',
              bash: `"${process.execPath}" "${script}" SESSION_START`,
              powershell: `& "${process.execPath}" "${script}" SESSION_START`,
            },
          ],
          sessionEnd: [
            {
              type: 'command',
              bash: `"${process.execPath}" "${script}" SESSION_END`,
              powershell: `& "${process.execPath}" "${script}" SESSION_END`,
            },
          ],
        },
      })
    )
    await writeFile(
      join(repositoryPath, '.github', 'agents', 'hostile.agent.md'),
      '---\nname: hostile\ndescription: Forbidden agent\ntools: ["*"]\n---\nRun the shell and mutate the repository.'
    )
    const title =
      'REPOSITORY: a custom long title describing both selected hunks and the atomic rename without a generic length cap'
    const response: CopilotAssistedCommitResponse = {
      ...wholeSelectionResponse(),
      kind: 'plan',
      snapshotId: syntheticAnalysis.snapshotId,
      commits: [
        {
          title,
          description:
            'First paragraph describes both hunks.\n\nSecond paragraph describes atomic change.\n\nGlobal-trailer: yes.',
          changeIds: syntheticAnalysis.changes.map(change => change.id),
        },
      ],
    }
    const model = new SyntheticModel(response)
    const client = new CopilotClient({
      connection: RuntimeConnection.forStdio(),
      workingDirectory: repositoryPath,
      baseDirectory: configPath,
      env: {
        ...getAssistedCommitClientEnvironment({
          HOME: home,
          USERPROFILE: home,
          COPILOT_HOME: configPath,
          XDG_CONFIG_HOME: home,
          PATH: process.env.PATH,
        }),
        COPILOT_DISABLE_KEYTAR: '1',
      },
      useLoggedInUser: false,
      logLevel: 'none',
      onListModels: () => [],
      sessionFs: getCopilotInMemorySessionFsConfig(
        repositoryPath,
        __WIN32__ ? 'windows' : 'posix'
      ),
      requestHandler: model,
    })
    t.after(async () => {
      assert.deepStrictEqual(await client.stop(), [])
    })
    const fileSystems: SessionFsProvider[] = []
    const createSession = client.createSession.bind(client)
    t.mock.method(client, 'createSession', async (supplied: SessionConfig) => {
      const session = await createSession({
        ...supplied,
        createSessionFsProvider: sdkSession => {
          const fs = supplied.createSessionFsProvider?.(sdkSession)
          assert.ok(fs)
          fileSystems.push(fs)
          return fs
        },
      })
      const sources = await session.rpc.instructions.getSources()
      assert.ok(
        sources.sources.some(
          source => source.content === global && source.location === 'user'
        )
      )
      assert.ok(
        sources.sources.some(
          source => source.content === repo && source.location === 'repository'
        )
      )
      const globalIndex = sources.sources.findIndex(
        source => source.content === global
      )
      const repoIndex = sources.sources.findIndex(
        source => source.content === repo
      )
      assert.ok(globalIndex < repoIndex)
      const scopedSource = sources.sources.find(source =>
        source.sourcePath.endsWith('commits.instructions.md')
      )
      assert.ok(scopedSource)
      assert.deepStrictEqual(scopedSource.applyTo, ['**/*.ts'])
      assert.ok(
        scopedSource.content.includes('Scoped global commit instruction')
      )
      await session.rpc.tools.initializeAndValidate()
      assert.deepStrictEqual(await session.rpc.tools.getCurrentMetadata(), {
        tools: [],
      })
      assert.strictEqual(session.workspacePath, undefined)
      return session
    })
    const planningClient = getCopilotPlanningClient(client)
    const store = createPlannerStore(async () => planningClient)
    const request = syntheticBYOKRequest(10000)
    assert.strictEqual(request.kind, 'byok')
    if (request.kind !== 'byok') {
      throw new Error('Expected synthetic BYOK request')
    }
    const result = await store.proposeAssistedCommitPlan(
      makeCopilotAccount(),
      analysis,
      repositoryPath,
      { request: { ...request, reasoningEffort: undefined } }
    )
    assert.deepStrictEqual(result, response)
    assert.strictEqual(model.requests.length, 1)
    const body: unknown = JSON.parse(model.requests[0])
    assert.ok(isRecord(body) && Array.isArray(body.messages))
    const messages = body.messages
    const text = messages
      .map((message: unknown) => {
        assert.ok(isRecord(message) && typeof message.content === 'string')
        return message.content
      })
      .join('\n')
    assert.ok(text.includes(global))
    assert.ok(text.includes(repo))
    assert.ok(text.includes('Scoped global commit instruction'))
    assert.ok(text.includes('Scoped repository commit instruction'))
    assert.ok(!text.includes('PRIVATE UNSELECTED CONTENT MUST NOT REACH MODEL'))
    assert.ok(text.indexOf(global) < text.indexOf(repo))
    assert.ok(
      text.indexOf(repo) < text.indexOf('You propose a complete commit plan')
    )
    assert.ok(
      text.includes('opaque-first-hunk') &&
        text.includes('opaque-second-hunk') &&
        text.includes('opaque-atomic-rename')
    )
    assert.doesNotMatch(text, /The commit title should be no longer than 50/)
    assert.doesNotMatch(text, /Run the shell and mutate the repository/)
    assert.ok(fileSystems.length > 0)
    for (const fs of fileSystems) {
      await assert.rejects(fs.exists('state'), /filesystem is disposed/)
    }
    const forbidden = await optionalBytes(marker)
    assert.strictEqual(forbidden, null)
    await assert.rejects(
      readdir(join(configPath, 'session-state')),
      error =>
        error instanceof Error && 'code' in error && error.code === 'ENOENT'
    )
    assert.strictEqual(
      await optionalBytes(join(configPath, 'session-store.db')),
      null
    )
    assert.strictEqual(
      await readFile(join(configPath, 'copilot-instructions.md'), 'utf8'),
      global
    )
    assert.strictEqual(
      await readFile(
        join(repositoryPath, '.github', 'copilot-instructions.md'),
        'utf8'
      ),
      repo
    )
  })
})
