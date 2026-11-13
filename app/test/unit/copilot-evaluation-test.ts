import assert from 'node:assert'
import { describe, it } from 'node:test'
import { join } from 'path'
import { mkdir, writeFile } from 'fs/promises'
import { CopilotClient } from '@github/copilot-sdk'
import {
  listCopilotEvaluationModels,
  runCopilotEvaluation,
} from '../../src/lib/copilot-evaluation'
import { CopilotAssistedCommitResponseSchema } from '../../src/lib/copilot-assisted-commit'
import { isolateGitConfig } from '../helpers/git-config'
import { createTempDirectory } from '../helpers/temp'
import { deferred } from '../helpers/copilot-assisted-commit'
import {
  ICopilotEvaluationRequest,
  IEvaluationRepositoryInput,
} from '../../src/lib/copilot-evaluation-protocol'

const analysis = {
  snapshotId: 'fixture-snapshot',
  changes: [
    {
      id: 'fixture-change',
      kind: 'text-hunk' as const,
      path: 'file.txt',
      diff: '@@ -1 +1 @@\n-old\n+new\n',
    },
  ],
}

function request(
  input: ICopilotEvaluationRequest['input'] = {
    kind: 'analysis',
    analysis,
  }
): ICopilotEvaluationRequest {
  return {
    protocolVersion: 1,
    feature: 'assisted-commit',
    model: 'offline-fixture',
    input,
    transport: {
      kind: 'fixture',
      responses: [
        { type: 'plan', groups: [{ title: 'Update the selected change' }] },
      ],
    },
  }
}

const repository: IEvaluationRepositoryInput = {
  kind: 'repository',
  baseFiles: { 'file.txt': 'old\n' },
  files: { 'file.txt': 'new\n' },
  selection: [{ path: 'file.txt' }],
}

describe('Copilot evaluation adapter', () => {
  it('rejects escaping paths and Git metadata before materializing fixtures', async () => {
    for (const path of [
      '../outside',
      '/absolute',
      'nested/../outside',
      'nested\\outside',
      '.git/config',
      '.GIT/config',
      '.git./config',
      'git~1/config',
      'C:/outside',
    ]) {
      const result = await runCopilotEvaluation(
        request({
          ...repository,
          baseFiles: { [path]: 'unsafe' },
        })
      )
      assert.strictEqual(result.error?.code, 'invalid-request')
      assert.strictEqual(result.turns.length, 0)
    }
  })

  it('validates actual Git trees without altering real fixture state', async () => {
    const result = await runCopilotEvaluation(request(repository))
    assert.strictEqual(result.status, 'ok', result.error?.message)
    assert.strictEqual(result.transport, 'fixture')
    assert.strictEqual(result.turns.length, 1)
    assert.deepStrictEqual(
      result.turns[0].responseSchema,
      CopilotAssistedCommitResponseSchema
    )
    const raw: unknown = JSON.parse(result.turns[0].content ?? '')
    assert.deepStrictEqual(raw, { result: result.response })
    assert.strictEqual(result.response?.kind, 'plan')
    assert.deepStrictEqual(result.validation, {
      kind: 'repository',
      trees: [result.validation?.selectedTree],
      selectedTree: result.validation?.selectedTree,
      preservedHead: true,
      preservedIndex: true,
      preservedWorktree: true,
    })
  })

  it('passes only selected hunks and excludes unselected files from prompts', async () => {
    const lines = Array.from({ length: 40 }, (_, i) => `line ${i}\n`)
    const changed = [...lines]
    changed[1] = 'selected change\n'
    changed[30] = 'UNSELECTED_HUNK_SENTINEL\n'
    const result = await runCopilotEvaluation(
      request({
        kind: 'repository',
        baseFiles: { 'file.txt': lines.join(''), other: 'old\n' },
        files: {
          'file.txt': changed.join(''),
          other: 'UNSELECTED_FILE_SENTINEL\n',
        },
        selection: [{ path: 'file.txt', hunks: [0] }],
      })
    )
    assert.strictEqual(result.status, 'ok', result.error?.message)
    assert.strictEqual(result.analysis?.changes.length, 1)
    assert.ok(result.turns[0].userPrompt.includes('selected change'))
    assert.ok(!result.turns[0].userPrompt.includes('UNSELECTED_'))
  })

  it('keeps hunk selection consistent when ambient Git changes diff context', async t => {
    await isolateGitConfig(t)
    const config = process.env.GIT_CONFIG_GLOBAL
    assert.ok(config)
    await writeFile(config, '[diff]\n\tcontext = 100\n')
    const lines = Array.from({ length: 40 }, (_, i) => `line ${i}\n`)
    const changed = [...lines]
    changed[1] = 'UNSELECTED_HUNK_SENTINEL\n'
    changed[30] = 'selected change\n'
    const result = await runCopilotEvaluation(
      request({
        kind: 'repository',
        baseFiles: { 'file.txt': lines.join('') },
        files: { 'file.txt': changed.join('') },
        selection: [{ path: 'file.txt', hunks: [1] }],
      })
    )
    assert.strictEqual(result.status, 'ok', result.error?.message)
    assert.ok(result.turns[0].userPrompt.includes('+selected change'))
    assert.ok(!result.turns[0].userPrompt.includes('UNSELECTED_'))
  })

  it('does not use ambient XDG ignore rules when seeding a fixture', async t => {
    const xdg = await createTempDirectory(t)
    await mkdir(join(xdg, 'git'))
    await writeFile(join(xdg, 'git', 'ignore'), 'file.txt\n')
    const previous = process.env.XDG_CONFIG_HOME
    t.after(() => {
      if (previous === undefined) {
        delete process.env.XDG_CONFIG_HOME
      } else {
        process.env.XDG_CONFIG_HOME = previous
      }
    })
    process.env.XDG_CONFIG_HOME = xdg
    const result = await runCopilotEvaluation(request(repository))
    assert.strictEqual(result.status, 'ok', result.error?.message)
    assert.ok(result.analysis?.changes[0].diff?.includes('-old'))
  })

  it('tracks declared baseline files even when fixture ignore rules match them', async () => {
    for (const ignore of ['file.txt\n', '*\n']) {
      const result = await runCopilotEvaluation(
        request({
          ...repository,
          baseFiles: { ...repository.baseFiles, '.gitignore': ignore },
        })
      )
      assert.strictEqual(result.status, 'ok', result.error?.message)
      assert.ok(result.analysis?.changes[0].diff?.includes('-old'))
      assert.ok(result.analysis?.changes[0].diff?.includes('+new'))
      assert.strictEqual(result.validation?.preservedIndex, true)
    }
  })

  it('handles binary fixture changes as indivisible atomic units', async () => {
    const result = await runCopilotEvaluation(
      request({
        kind: 'repository',
        baseFiles: { binary: '\0old' },
        files: { binary: '\0new' },
        selection: [{ path: 'binary' }],
      })
    )
    assert.strictEqual(result.status, 'ok', result.error?.message)
    assert.strictEqual(result.analysis?.changes[0].kind, 'atomic')
  })

  it('rejects empty analysis and invalid deadlines before making model calls', async () => {
    const empty = await runCopilotEvaluation(
      request({
        kind: 'analysis',
        analysis: { snapshotId: 'empty', changes: [] },
      })
    )
    assert.strictEqual(empty.error?.code, 'empty-selection')
    assert.strictEqual(empty.turns.length, 0)
    const timeout = await runCopilotEvaluation({
      ...request(),
      timeoutMs: 0,
    })
    assert.strictEqual(timeout.error?.code, 'invalid-request')
    assert.strictEqual(timeout.turns.length, 0)
  })

  it('cancels model preflight during startup without requesting model metadata', async t => {
    const previous = process.env.COPILOT_GITHUB_TOKEN
    process.env.COPILOT_GITHUB_TOKEN = 'synthetic-evaluation-token'
    t.after(() => {
      if (previous === undefined) {
        delete process.env.COPILOT_GITHUB_TOKEN
      } else {
        process.env.COPILOT_GITHUB_TOKEN = previous
      }
    })
    const controller = new AbortController()
    const start = t.mock.method(CopilotClient.prototype, 'start', async () => {
      controller.abort()
    })
    const list = t.mock.method(
      CopilotClient.prototype,
      'listModels',
      async () => assert.fail('Cancelled preflight requested model metadata')
    )
    const stop = t.mock.method(
      CopilotClient.prototype,
      'forceStop',
      async () => {}
    )
    await assert.rejects(
      listCopilotEvaluationModels(controller.signal),
      /Model preflight cancelled/
    )
    assert.strictEqual(start.mock.callCount(), 1)
    assert.strictEqual(list.mock.callCount(), 0)
    assert.strictEqual(stop.mock.callCount(), 1)
  })

  for (const cancel of [true, false]) {
    const code = cancel ? 'cancelled' : 'timed-out'
    it(`records elapsed turn time when planning is ${code}`, async t => {
      const previous = process.env.COPILOT_GITHUB_TOKEN
      process.env.COPILOT_GITHUB_TOKEN = 'synthetic-evaluation-token'
      t.after(() => {
        if (previous === undefined) {
          delete process.env.COPILOT_GITHUB_TOKEN
        } else {
          process.env.COPILOT_GITHUB_TOKEN = previous
        }
      })
      if (!cancel) {
        t.mock.timers.enable({ apis: ['setTimeout'] })
      }
      const sent = deferred<void>()
      const disconnect = t.mock.fn(async () => {})
      t.mock.method(CopilotClient.prototype, 'createSession', async () => ({
        on: () => () => {},
        send: async () => {
          sent.resolve()
          return 'synthetic-request'
        },
        disconnect,
      }))
      const stop = t.mock.method(
        CopilotClient.prototype,
        'forceStop',
        async () => {}
      )
      const controller = new AbortController()
      const pending = runCopilotEvaluation(
        {
          ...request(),
          timeoutMs: 100,
          transport: { kind: 'copilot' },
        },
        controller.signal
      )
      await sent.promise
      if (cancel) {
        controller.abort()
      } else {
        t.mock.timers.tick(100)
      }
      const result = await pending
      assert.strictEqual(result.error?.code, code)
      assert.strictEqual(result.turns.length, 1)
      assert.ok(result.turns[0].durationMs > 0)
      assert.strictEqual(disconnect.mock.callCount(), 0)
      assert.strictEqual(stop.mock.callCount(), 1)
    })
  }

  it('preserves malformed output and never retries it into a pass', async () => {
    const result = await runCopilotEvaluation({
      ...request(repository),
      transport: {
        kind: 'fixture',
        responses: [{ type: 'raw', content: '{' }],
      },
    })

    it('rejects legacy bare outcomes instead of bypassing the structured envelope', async () => {
      const result = await runCopilotEvaluation({
        ...request(),
        transport: {
          kind: 'fixture',
          responses: [
            {
              type: 'raw',
              content: JSON.stringify({
                kind: 'plan',
                snapshotId: analysis.snapshotId,
                commits: [
                  {
                    title: 'Update file',
                    description: '',
                    changeIds: [analysis.changes[0].id],
                  },
                ],
              }),
            },
          ],
        },
      })
      assert.strictEqual(result.status, 'error')
      assert.strictEqual(result.error?.code, 'invalid-response')
      assert.strictEqual(result.turns.length, 1)
      assert.ok(result.turns[0].content?.includes(analysis.snapshotId))
    })

    it('rejects a raw refusal instead of accepting it or inventing a whole-selection message', async () => {
      const content = JSON.stringify({
        result: {
          kind: 'unsafe',
          snapshotId: analysis.snapshotId,
          reason: 'Changes not analyzable',
        },
      })
      const result = await runCopilotEvaluation({
        ...request(),
        transport: {
          kind: 'fixture',
          responses: [{ type: 'raw', content }],
        },
      })
      assert.strictEqual(result.status, 'error')
      assert.strictEqual(result.error?.code, 'invalid-response')
      assert.strictEqual(result.response, undefined)
      assert.strictEqual(result.turns.length, 1)
      assert.strictEqual(result.turns[0].content, content)
    })

    it('distinguishes semantically invalid schema envelopes from invalid JSON', async () => {
      const result = await runCopilotEvaluation({
        ...request(),
        transport: {
          kind: 'fixture',
          responses: [
            {
              type: 'raw',
              content: JSON.stringify({
                result: {
                  kind: 'plan',
                  snapshotId: analysis.snapshotId,
                  commits: [
                    {
                      title: 'Duplicate ownership',
                      description: '',
                      changeIds: [
                        analysis.changes[0].id,
                        analysis.changes[0].id,
                      ],
                    },
                  ],
                },
              }),
            },
          ],
        },
      })
      assert.strictEqual(result.error?.code, 'invalid-response')
      assert.ok(!result.error.message.includes('invalid or incomplete JSON'))
      assert.strictEqual(result.turns.length, 1)
    })
    assert.strictEqual(result.error?.code, 'invalid-response')
    assert.strictEqual(result.turns.length, 1)
    assert.strictEqual(result.turns[0].content, '{')
    assert.strictEqual(result.validation?.preservedWorktree, true)
  })

  it('materializes a replacement child before its parent deletion in the file map', async () => {
    const result = await runCopilotEvaluation(
      request({
        kind: 'repository',
        baseFiles: { replaced: 'old file\n' },
        files: { 'replaced/child': 'new child\n', replaced: null },
        selection: [{ path: 'replaced' }, { path: 'replaced/child' }],
      })
    )
    assert.strictEqual(result.status, 'ok', result.error?.message)
    assert.deepStrictEqual(
      result.analysis?.changes.map(change => change.path).sort(),
      ['replaced', 'replaced/child']
    )
    assert.strictEqual(result.validation?.preservedHead, true)
    assert.strictEqual(result.validation?.preservedIndex, true)
    assert.strictEqual(result.validation?.preservedWorktree, true)
  })

  it('records both turns of the canonical unsafe-split fallback', async () => {
    const result = await runCopilotEvaluation({
      ...request({
        kind: 'repository',
        baseFiles: { replaced: 'old file\n' },
        files: { replaced: null, 'replaced/child': 'new child\n' },
        selection: [{ path: 'replaced' }, { path: 'replaced/child' }],
      }),
      transport: {
        kind: 'fixture',
        responses: [
          {
            type: 'plan',
            groups: [
              { title: 'Add child', paths: ['replaced/child'] },
              { title: 'Remove file', paths: ['replaced'] },
            ],
          },
          {
            type: 'plan',
            groups: [{ title: 'Replace file with directory and child' }],
          },
        ],
      },
    })
    assert.strictEqual(result.status, 'ok', result.error?.message)
    assert.deepStrictEqual(
      result.turns.map(turn => turn.mode),
      ['plan', 'single-commit']
    )
    assert.strictEqual(result.response?.kind, 'plan')
    if (result.response?.kind === 'plan') {
      assert.strictEqual(
        result.response.commits[0].title,
        'Replace file with directory and child'
      )
    }
    assert.ok(!result.turns[1].userPrompt.includes('Add child'))
    assert.ok(
      result.turns.every(
        turn =>
          JSON.stringify(turn.responseSchema) ===
          JSON.stringify(CopilotAssistedCommitResponseSchema)
      )
    )
  })

  it('rejects unmatched and duplicate hunk selections explicitly', async () => {
    for (const hunks of [[99], [0, 0]]) {
      const result = await runCopilotEvaluation(
        request({
          ...repository,
          selection: [{ path: 'file.txt', hunks }],
        })
      )
      assert.strictEqual(result.error?.code, 'invalid-request')
      assert.strictEqual(result.turns.length, 0)
    }
  })
})
