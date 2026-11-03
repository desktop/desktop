import assert from 'node:assert'
import { describe, it } from 'node:test'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import {
  AssistedCommitSelection,
  IAssistedCommitSelectionSource,
} from '../../src/lib/assisted-commit/selection'
import { getAssistedCommitInputVersions } from '../../src/lib/assisted-commit-request'
import { ChangesSelectionKind } from '../../src/lib/app-state'
import { getWorkingDirectoryDiff } from '../../src/lib/git'
import { readAssistedCommitHead } from '../../src/lib/git/assisted-commit'
import { withRepositoryGitOperation } from '../../src/lib/git/repository-operation'
import {
  DiffSelection,
  DiffSelectionType,
  DiffType,
} from '../../src/models/diff'
import { WorkingDirectoryStatus } from '../../src/models/status'
import { TipState } from '../../src/models/tip'
import { Branch, BranchType } from '../../src/models/branch'
import { createTestRepositoryStateCache } from '../helpers/app-store-test-harness'
import { indexPath, request, seed, tip } from '../helpers/assisted-commit'

describe('assisted selection ownership', () => {
  it('certifies and retires partial authority without owning a run or changing Git', async t => {
    const repository = await seed(t, { file: 'before\n' })
    await writeFile(join(repository.path, 'file'), 'after\n')
    const input = await request(repository)
    const diff = await getWorkingDirectoryDiff(repository, input.files[0])
    assert.ok(diff.kind === DiffType.Text)
    const lines = diff.hunks.flatMap(hunk =>
      hunk.lines.flatMap((line, index) =>
        line.isIncludeableLine() ? [hunk.unifiedDiffStart + index] : []
      )
    )
    assert.ok(lines.length > 1)
    const mask = DiffSelection.fromInitialSelection(DiffSelectionType.None)
      .withSelectableLines(new Set(lines))
      .withLineSelection(lines[0], true)
    assert.strictEqual(mask.getSelectionType(), DiffSelectionType.Partial)
    const selected = input.files[0].withSelection(mask)
    const cache = createTestRepositoryStateCache()
    const head = await readAssistedCommitHead(repository)
    const sha = head.sha
    const ref = head.ref
    assert.ok(sha !== null)
    assert.ok(ref !== null)
    cache.update(repository, state => ({
      branchesState: {
        ...state.branchesState,
        tip: {
          kind: TipState.Valid,
          branch: new Branch(
            ref.replace(/^refs\/heads\//, ''),
            null,
            { sha },
            BranchType.Local,
            ref
          ),
        },
      },
      changesState: {
        ...state.changesState,
        workingDirectory: WorkingDirectoryStatus.fromFiles([selected]),
        selection: {
          kind: ChangesSelectionKind.WorkingDirectory,
          selectedFileIDs: [selected.id],
          diff,
        },
      },
    }))
    const selections = new AssistedCommitSelection(cache, () => false)
    const independent = new AssistedCommitSelection(cache, () => false)
    selections.recordLineSelection(repository, selected, mask)
    const beforeHead = await tip(repository)
    const beforeIndex = await readFile(await indexPath(repository))
    const versions = await selections.verifyRequested(repository, [selected])
    const source: IAssistedCommitSelectionSource = {
      repository,
      request: { ...input, files: [selected] },
      initialState: cache.get(repository),
      inputVersions: versions,
    }
    await selections.certifyUncaptured(source)
    assert.strictEqual(selections.hasRestored(mask), true)
    assert.strictEqual(independent.hasRestored(mask), false)
    const certified = await withRepositoryGitOperation(
      repository.path,
      'read',
      () => selections.verifyManual(repository, [selected])
    )
    assert.strictEqual(certified.get(selected.id)?.text, diff.text)
    await selections.verifyFence(source)
    assert.deepStrictEqual(
      versions,
      await getAssistedCommitInputVersions(repository, [selected])
    )
    assert.strictEqual(await tip(repository), beforeHead)
    assert.deepStrictEqual(
      await readFile(await indexPath(repository)),
      beforeIndex
    )
    await assert.rejects(
      independent.verifyRequested(repository, [selected]),
      /original basis/
    )
    selections.retire(repository, [selected])
    assert.strictEqual(selections.hasRestored(mask), false)
    await assert.rejects(
      selections.verifyRequested(repository, [selected]),
      /original basis/
    )
  })
})
