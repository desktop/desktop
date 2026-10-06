import assert from 'node:assert'
import { access, mkdir, readFile, readdir } from 'fs/promises'
import { join } from 'path'
import { describe, it } from 'node:test'
import { createAssistedCommitInstructionScope } from '../../src/lib/copilot-assisted-commit-instructions'
import { ICopilotGlobalInstructions } from '../../src/lib/copilot-operation'
import { createTempDirectory } from '../helpers/temp'
import { assertPlanningError } from '../helpers/copilot-assisted-commit'

function context(directory: string): ICopilotGlobalInstructions {
  return {
    directory,
    sources: [
      {
        id: 'home-copilot',
        label: 'Global instructions',
        sourcePath: join(directory, 'copilot-instructions.md'),
        type: 'home',
        location: 'user',
        content: 'Global title/trailer instructions',
      },
    ],
  }
}

describe('instruction-only assisted planner configuration', () => {
  it('copies SDK-discovered global files and raw scoped metadata, never executable config', async t => {
    const directory = await createTempDirectory(t)
    const global = context(directory)
    const scoped = '---\napplyTo: "**/*.ts"\n---\nScoped commit instructions'
    const scope = await createAssistedCommitInstructionScope(
      {
        ...global,
        sources: [
          ...global.sources,
          {
            id: 'user-scoped',
            label: 'Scoped instructions',
            sourcePath: join(
              directory,
              'instructions',
              'nested',
              'commits.instructions.md'
            ),
            content: scoped,
            type: 'vscode',
            location: 'user',
            applyTo: ['**/*.ts'],
          },
        ],
      },
      { cancellationError: () => new Error('cancelled') }
    )
    t.after(() => scope.dispose())
    assert.notStrictEqual(scope.directory, directory)
    assert.deepStrictEqual(await readdir(scope.directory), [
      'copilot-instructions.md',
      'instructions',
    ])
    assert.strictEqual(
      await readFile(join(scope.directory, 'copilot-instructions.md'), 'utf8'),
      global.sources[0].content
    )
    assert.strictEqual(
      await readFile(
        join(
          scope.directory,
          'instructions',
          'nested',
          'commits.instructions.md'
        ),
        'utf8'
      ),
      scoped
    )
    await scope.dispose()
    await scope.dispose()
    await assert.rejects(access(scope.directory), /ENOENT/)
  })

  for (const path of [
    '../copilot-instructions.md',
    'mcp-config.json',
    'instructions/../../mcp-config.json',
    'instructions/tool.json',
  ]) {
    it(`rejects executable/out-of-scope source ${path}`, async t => {
      const directory = await createTempDirectory(t)
      const global = context(directory)
      await assert.rejects(
        createAssistedCommitInstructionScope(
          {
            ...global,
            sources: [{ ...global.sources[0], sourcePath: path }],
          },
          { cancellationError: () => new Error('cancelled') }
        ),
        assertPlanningError('invalid-request')
      )
    })
  }

  it('rejects non-user instruction sources instead of silently suppressing or copying them', async t => {
    const directory = await createTempDirectory(t)
    const global = context(directory)
    await assert.rejects(
      createAssistedCommitInstructionScope(
        {
          ...global,
          sources: [{ ...global.sources[0], location: 'repository' }],
        },
        { cancellationError: () => new Error('cancelled') }
      ),
      assertPlanningError('invalid-request')
    )
  })

  it('does not recursively remove an externally replaced directory', async t => {
    const directory = await createTempDirectory(t)
    const scope = await createAssistedCommitInstructionScope(
      context(directory),
      { cancellationError: () => new Error('cancelled') }
    )
    const { rename } = await import('fs/promises')
    const retained = `${scope.directory}-retained`
    await rename(scope.directory, retained)
    await mkdir(scope.directory)
    const { writeFile, rm } = await import('fs/promises')
    await writeFile(join(scope.directory, 'external'), 'external data')
    t.after(async () => {
      await rm(scope.directory, { recursive: true })
      await rm(retained, { recursive: true })
    })
    await assert.rejects(
      scope.dispose(),
      /owned Copilot instruction directory was replaced/
    )
    assert.strictEqual(
      await readFile(join(scope.directory, 'external'), 'utf8'),
      'external data'
    )
  })
})
