import assert from 'node:assert'
import { before, describe, it, mock } from 'node:test'
import * as FileSystem from 'fs/promises'
import { join } from 'path'

let harness: typeof import('../../helpers/assisted-commit-run')
let fixtures: typeof import('../../helpers/assisted-commit')
let models: typeof import('../../helpers/copilot-assisted-commit')
let diffs: typeof import('../../../src/lib/git/diff')
let diffModels: typeof import('../../../src/models/diff')
let afterStat:
  | ((path: Parameters<typeof FileSystem.lstat>[0]) => Promise<void>)
  | undefined

before(async () => {
  const stat = FileSystem.lstat
  mock.module('fs/promises', {
    namedExports: {
      ...FileSystem,
      lstat: async (...args: Parameters<typeof FileSystem.lstat>) => {
        const result = await stat(...args)
        await afterStat?.(args[0])
        return result
      },
    },
  })
  ;[harness, fixtures, models, diffs, diffModels] = await Promise.all([
    import('../../helpers/assisted-commit-run'),
    import('../../helpers/assisted-commit'),
    import('../../helpers/copilot-assisted-commit'),
    import('../../../src/lib/git/diff'),
    import('../../../src/models/diff'),
  ])
})

describe('assisted certified diff publication', () => {
  it('merges certified selection into the latest real status instead of overwriting other rows', async t => {
    const base = Array.from({ length: 60 }, (_, index) => `line ${index + 1}\n`)
    const source = await fixtures.seed(t, { file: base.join('') })
    const current = [...base]
    current[3] = 'selected prefix\n'
    current[49] = 'unselected suffix\n'
    await FileSystem.writeFile(join(source.path, 'file'), current.join(''))
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const file = h.request(repository).files[0]
    const diff = await diffs.getWorkingDirectoryDiff(repository, file)
    assert.ok(diff.kind === diffModels.DiffType.Text && diff.hunks.length === 2)
    let selection = file.selection
    for (const [index, line] of diff.hunks[1].lines.entries()) {
      if (line.isIncludeableLine()) {
        selection = selection.withLineSelection(
          diff.hunks[1].unifiedDiffStart + index,
          false
        )
      }
    }
    await h.dispatcher.changeFileLineSelection(repository, file, selection)
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      h.cancel(repository)
      return models.wholeSelectionResponse(analysis)
    })
    assert.strictEqual(
      (
        await h.dispatcher.createCopilotAssistedCommits(
          repository,
          h.request(repository)
        )
      ).kind,
      'cancelled'
    )
    const reload = h.appStore['updateChangesWorkingDirectoryDiff'].bind(
      h.appStore
    )
    let insideStatus = false
    h.appStore['updateChangesWorkingDirectoryDiff'] = async repo => {
      if (!insideStatus) {
        await reload(repo)
      }
    }
    let injected = false
    t.after(() => {
      afterStat = undefined
    })
    afterStat = async path => {
      if (path === join(repository.path, 'file') && !injected) {
        injected = true
        afterStat = undefined
        await FileSystem.writeFile(
          join(repository.path, 'later'),
          'new unselected file\n'
        )
        insideStatus = true
        try {
          await h.appStore._loadStatus(repository)
        } finally {
          insideStatus = false
        }
        assert.ok(
          h
            .state(repository)
            .changesState.workingDirectory.files.some(
              file => file.path === 'later'
            )
        )
      }
    }
    await reload(repository)
    assert.strictEqual(injected, true)
    const files = h.state(repository).changesState.workingDirectory.files
    assert.ok(files.some(file => file.path === 'later'))
    assert.strictEqual(
      files.find(file => file.path === 'file')?.selection.getSelectionType(),
      diffModels.DiffSelectionType.Partial
    )
    assert.strictEqual(await fixtures.count(repository), 1)
  })
})
