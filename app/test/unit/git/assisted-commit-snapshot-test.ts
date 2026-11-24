import assert from 'node:assert'
import { before, describe, it, mock } from 'node:test'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import {
  DiffSelection,
  DiffSelectionType,
  DiffType,
} from '../../../src/models/diff'
import { WorkingDirectoryFileChange } from '../../../src/models/status'

let engine: typeof import('../../../src/lib/git/assisted-commit')
let fixtures: typeof import('../../helpers/assisted-commit')
let diff: typeof import('../../../src/lib/git/diff')
let config: typeof import('../../../src/lib/hooks/config')
let operations: string[] | undefined

before(async () => {
  mock.module('../../../src/ui/lib/git-perf.ts', {
    namedExports: {
      start: () => {},
      stop: () => {},
      measure: <T>(name: string, operation: () => Promise<T>) => {
        operations?.push(name.split(': git ')[0])
        return operation()
      },
    },
  })
  ;[engine, fixtures, diff, config] = await Promise.all([
    import('../../../src/lib/git/assisted-commit'),
    import('../../helpers/assisted-commit'),
    import('../../../src/lib/git/diff'),
    import('../../../src/lib/hooks/config'),
  ])
})

describe('git/assisted-commit snapshot tree reuse', () => {
  for (const partialCount of [0, 1, 3]) {
    it(`materializes each whole-file tree once with ${partialCount} partial selections`, async t => {
      config.setHooksEnvEnabled(false)
      t.after(() => {
        operations = undefined
        localStorage.removeItem('git-hooks-env-enabled')
      })
      const base = Array.from({ length: 40 }, (_, i) => `line ${i + 1}\n`)
      const paths = ['shared/[file].txt', 'shared/-file.txt', 'other/file.txt']
      const repository = await fixtures.seed(t, {
        ...Object.fromEntries(paths.map(path => [path, base.join('')])),
        'shared/unselected.txt': 'original\n',
      })
      const changed = [...base]
      changed[1] = 'selected first\n'
      changed[30] = 'last change\n'
      for (const path of paths) {
        await writeFile(join(repository.path, path), changed.join(''))
      }
      await writeFile(
        join(repository.path, 'shared/unselected.txt'),
        'unselected staged content\n'
      )
      await fixtures.rawGit(repository, ['add', '--', 'shared/unselected.txt'])
      const input = await fixtures.request(repository, paths)
      const files: WorkingDirectoryFileChange[] = []
      for (const [index, file] of input.files.entries()) {
        if (index >= partialCount) {
          files.push(file)
          continue
        }
        const displayed = await diff.getWorkingDirectoryDiff(repository, file)
        assert.strictEqual(displayed.kind, DiffType.Text)
        if (displayed.kind !== DiffType.Text) {
          throw new Error('Expected a text diff')
        }
        const firstHunk = displayed.hunks[0]
        files.push(
          file.withSelection(
            DiffSelection.fromInitialSelection(
              DiffSelectionType.None
            ).withRangeSelection(
              firstHunk.unifiedDiffStart,
              firstHunk.lines.length,
              true
            )
          )
        )
      }
      const originalHead = await fixtures.tip(repository)
      const originalIndex = await readFile(await fixtures.indexPath(repository))
      const capturedOperations: string[] = []
      operations = capturedOperations
      await engine.withAssistedCommitSnapshot(
        repository,
        { ...input, files },
        async snapshot => {
          operations = undefined
          for (const name of [
            'assistedCommitReadTree',
            'assistedCommitWriteTree',
          ]) {
            assert.strictEqual(
              capturedOperations.filter(operation => operation === name).length,
              files.length + partialCount + 2,
              name
            )
          }
          assert.strictEqual(
            capturedOperations.filter(
              operation => operation === 'assistedCommitWriteIndex'
            ).length,
            files.length + partialCount + 1
          )
          assert.strictEqual(
            capturedOperations.filter(
              operation => operation === 'assistedCommitCertifyPartialDiff'
            ).length,
            partialCount
          )
          for (const [index, file] of files.entries()) {
            const expected = [...changed]
            if (index < partialCount) {
              expected[30] = base[30]
            }
            assert.deepStrictEqual(
              await fixtures.commitBytes(
                repository,
                snapshot.selectedTree,
                file.path
              ),
              Buffer.from(expected.join(''))
            )
            const analysis = snapshot.analysis.changes
              .filter(change => change.path === file.path)
              .map(change => change.diff)
              .join('\n')
            assert.ok(analysis.includes('+selected first'))
            assert.strictEqual(
              analysis.includes('+last change'),
              index >= partialCount
            )
          }
          assert.deepStrictEqual(
            await fixtures.commitBytes(
              repository,
              snapshot.selectedTree,
              'shared/unselected.txt'
            ),
            Buffer.from('original\n')
          )
          await engine.validateAssistedCommitPlan(
            snapshot,
            fixtures.splitPlan(snapshot, true)
          )
        }
      )
      assert.strictEqual(await fixtures.tip(repository), originalHead)
      assert.deepStrictEqual(
        await readFile(await fixtures.indexPath(repository)),
        originalIndex
      )
      for (const path of paths) {
        assert.strictEqual(
          await readFile(join(repository.path, path), 'utf8'),
          changed.join('')
        )
      }
    })
  }
})
