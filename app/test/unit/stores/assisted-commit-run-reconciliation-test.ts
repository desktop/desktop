import assert from 'node:assert'
import { describe, it } from 'node:test'
import { readFile, realpath, rename, writeFile } from 'fs/promises'
import { join } from 'path'
import { createAssistedCommitRunHarness } from '../../helpers/assisted-commit-run'
import {
  commitBytes,
  count,
  rawGit,
  seed,
  tip,
} from '../../helpers/assisted-commit'
import {
  deferred,
  wholeSelectionResponse,
} from '../../helpers/copilot-assisted-commit'
import { DefaultCommitMessage } from '../../../src/models/commit-message'
import { getWorkingDirectoryDiff } from '../../../src/lib/git/diff'
import {
  DiffLineType,
  DiffSelection,
  DiffSelectionType,
  DiffType,
} from '../../../src/models/diff'
import { Repository } from '../../../src/models/repository'
import { isRepositoryGitPaused } from '../../../src/lib/git/repository-operation'

describe('AppStore assisted commit reconciliation', () => {
  it('rejects selected-file changes during final reconciliation and rolls back the completed result', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const originalHead = await tip(repository)
    const refresh = h.assisted.recovery['refresh'].bind(h.assisted.recovery)
    h.assisted.recovery['refresh'] = async (...args) => {
      if (
        h.state(repository).changesState.assistedCommit.kind === 'finishing'
      ) {
        await writeFile(join(repository.path, 'file'), 'CURRENT user edit\n')
      }
      return refresh(...args)
    }
    const result = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.strictEqual(result.kind, 'error')
    assert.strictEqual(await tip(repository), originalHead)
    assert.strictEqual(
      await readFile(join(repository.path, 'file'), 'utf8'),
      'CURRENT user edit\n'
    )
    assert.strictEqual(h.commits.mock.callCount(), 0)
  })

  it('reconciles changed selected text by original content anchors, never stale line offsets', async t => {
    const base = 'line one\nline two\nline three\nline four\n'
    const source = await seed(t, { 'file.txt': base })
    await writeFile(
      join(source.path, 'file.txt'),
      'line one\nSELECTED\nline three\nUNSELECTED\n'
    )
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const file = h.request(repository).files[0]
    const diff = await getWorkingDirectoryDiff(repository, file)
    assert.ok(diff.kind === DiffType.Text)
    let selection = DiffSelection.fromInitialSelection(DiffSelectionType.None)
    for (const hunk of diff.hunks) {
      for (const [index, line] of hunk.lines.entries()) {
        if (line.type === DiffLineType.Add && line.content === 'SELECTED') {
          selection = selection.withLineSelection(
            hunk.unifiedDiffStart + index,
            true
          )
        }
      }
    }
    await h.dispatcher.changeFileLineSelection(repository, file, selection)
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      await writeFile(
        join(repository.path, 'file.txt'),
        'NEW UNSELECTED TOP\nline one\nSELECTED\nline three\nUNSELECTED\n'
      )
      return wholeSelectionResponse(analysis)
    })
    const result = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.strictEqual(result.kind, 'error')
    const currentFile =
      h.state(repository).changesState.workingDirectory.files[0]
    const currentDiff = await getWorkingDirectoryDiff(repository, currentFile)
    assert.ok(currentDiff.kind === DiffType.Text)
    const selected = currentDiff.hunks.flatMap(hunk =>
      hunk.lines
        .filter(
          (line, index) =>
            line.isIncludeableLine() &&
            currentFile.selection.isSelected(hunk.unifiedDiffStart + index)
        )
        .map(line => line.content)
    )
    assert.deepStrictEqual(selected, ['SELECTED'])
    assert.strictEqual(await count(repository), 1)
    assert.strictEqual(
      await readFile(join(repository.path, 'file.txt'), 'utf8'),
      'NEW UNSELECTED TOP\nline one\nSELECTED\nline three\nUNSELECTED\n'
    )
  })

  it('keeps newly renamed/deleted or ambiguous current content excluded, never restoring old bytes', async t => {
    const source = await seed(t, { 'file.txt': 'before\n' })
    await writeFile(join(source.path, 'file.txt'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      await rename(
        join(repository.path, 'file.txt'),
        join(repository.path, 'moved.txt')
      )
      return wholeSelectionResponse(analysis)
    })
    assert.strictEqual(
      (
        await h.dispatcher.createCopilotAssistedCommits(
          repository,
          h.request(repository)
        )
      ).kind,
      'error'
    )
    assert.ok(
      h
        .state(repository)
        .changesState.workingDirectory.files.every(
          file => file.selection.getSelectionType() === DiffSelectionType.None
        )
    )
    assert.strictEqual(
      await readFile(join(repository.path, 'moved.txt'), 'utf8'),
      'selected\n'
    )
    assert.strictEqual(await count(repository), 1)
  })

  it('continues through unselected edits and coalesces Desktop status, indicator and diff readers', async t => {
    const source = await seed(t, { selected: 'before\n', other: 'other\n' })
    await writeFile(join(source.path, 'selected'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    let reader: Promise<unknown> | undefined
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      await writeFile(join(repository.path, 'other'), 'new unselected\n')
      reader = h.appStore._loadStatus(repository)
      await h.appStore._refreshRepository(repository)
      await h.appStore['refreshIndicatorForRepository'](repository)
      await h.appStore['updateChangesWorkingDirectoryDiff'](repository)
      return wholeSelectionResponse(analysis)
    })
    assert.strictEqual(
      (
        await h.dispatcher.createCopilotAssistedCommits(
          repository,
          h.request(repository)
        )
      ).kind,
      'local-ready'
    )
    await reader
    assert.deepStrictEqual(
      await commitBytes(repository, 'HEAD', 'other'),
      Buffer.from('other\n')
    )
    assert.strictEqual(
      await readFile(join(repository.path, 'other'), 'utf8'),
      'new unselected\n'
    )
    assert.ok(
      h
        .state(repository)
        .changesState.workingDirectory.files.some(file => file.path === 'other')
    )
    assert.ok(
      h
        .state(repository)
        .changesState.workingDirectory.files.every(
          file => file.selection.getSelectionType() === DiffSelectionType.None
        )
    )
    assert.strictEqual(isRepositoryGitPaused(repository.path), false)
  })

  it('keeps repository A and B run state and frozen repository/account intent independent', async t => {
    const first = await seed(t, { file: 'first\n' })
    const second = await seed(t, { file: 'second\n' })
    await writeFile(join(first.path, 'file'), 'FIRST\n')
    await writeFile(join(second.path, 'file'), 'SECOND\n')
    const h = await createAssistedCommitRunHarness(t)
    const repoA = await h.register(first)
    const repoB = await h.register(second)
    const firstPath = await realpath(repoA.path)
    const analyzing = deferred<void>()
    const finish = deferred<void>()
    h.propose.mock.mockImplementation(async (_account, analysis, path) => {
      if (path === firstPath) {
        analyzing.resolve()
        await finish.promise
      }
      return wholeSelectionResponse(
        analysis,
        path === firstPath ? 'First repository' : 'Second repository'
      )
    })
    const runA = h.dispatcher.createCopilotAssistedCommits(
      repoA,
      h.request(repoA)
    )
    await analyzing.promise
    h.appStore['selectedRepository'] = repoB
    assert.strictEqual(h.state(repoB).changesState.assistedCommit.kind, 'idle')
    assert.strictEqual(
      (await h.dispatcher.createCopilotAssistedCommits(repoB, h.request(repoB)))
        .kind,
      'local-ready'
    )
    assert.strictEqual(
      h.state(repoA).changesState.assistedCommit.kind,
      'analyzing'
    )
    finish.resolve()
    assert.strictEqual((await runA).kind, 'local-ready')
    assert.strictEqual(
      await rawGit(repoA, ['show', '-s', '--format=%s', 'HEAD']),
      'First repository'
    )
    assert.strictEqual(
      await rawGit(repoB, ['show', '-s', '--format=%s', 'HEAD']),
      'Second repository'
    )
  })

  it('retains newer manual drafts edited during analysis and clears filters only on accepted success', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'after\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.stores.repositoryStateCache.updateChangesState(repository, state => ({
      fileListFilter: { ...state.fileListFilter, filterText: 'file' },
    }))
    const newer = {
      ...DefaultCommitMessage,
      summary: 'New manual draft',
      description: 'Do not clear',
      timestamp: Date.now(),
    }
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      await h.dispatcher.setCommitMessage(repository, newer)
      assert.strictEqual(
        h.state(repository).changesState.fileListFilter.filterText,
        'file'
      )
      return wholeSelectionResponse(analysis)
    })
    assert.strictEqual(
      (
        await h.dispatcher.createCopilotAssistedCommits(
          repository,
          h.request(repository)
        )
      ).kind,
      'local-ready'
    )
    assert.deepStrictEqual(
      h.state(repository).changesState.commitMessage,
      newer
    )
    assert.strictEqual(
      h.state(repository).changesState.fileListFilter.filterText,
      ''
    )
  })

  it('keeps progress and Cancel attached to repository identity when refreshed metadata changes its hash', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'after\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const analyzing = deferred<void>()
    const finish = deferred<void>()
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      analyzing.resolve()
      await finish.promise
      return wholeSelectionResponse(analysis)
    })
    const operation = h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    await analyzing.promise
    const updated = new Repository(
      repository.path,
      repository.id,
      null,
      false,
      'New alias',
      {},
      false,
      repository.gitDir
    )
    assert.notStrictEqual(updated.hash, repository.hash)
    assert.strictEqual(
      h.state(updated).changesState.assistedCommit.kind,
      'analyzing'
    )
    h.cancel(updated)
    finish.resolve()
    assert.strictEqual((await operation).kind, 'cancelled')
    assert.strictEqual(
      h.state(updated).changesState.assistedCommit.kind,
      'idle'
    )
    assert.strictEqual(await count(repository), 1)
  })
})
