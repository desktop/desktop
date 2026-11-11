import assert from 'node:assert'
import { describe, it } from 'node:test'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { createAssistedCommitRunHarness } from '../../helpers/assisted-commit-run'
import {
  count,
  indexPath,
  optionalBytes,
  rawGit,
  seed,
  tip,
} from '../../helpers/assisted-commit'
import {
  splitResponse,
  wholeSelectionResponse,
} from '../../helpers/copilot-assisted-commit'
import { CopilotAssistedCommitError } from '../../../src/lib/copilot-assisted-commit'
import { CopilotError } from '../../../src/lib/copilot-error'
import { assistedCommitErrorCauses } from '../../../src/lib/assisted-commit-run'

describe('AppStore assisted commit run cancellation and recovery', () => {
  it('cancel after the first commit removes every run commit and restores the original index and selection', async t => {
    const source = await seed(t, {
      'one.txt': 'before one\n',
      'two.txt': 'before two\n',
    })
    await writeFile(join(source.path, 'one.txt'), 'after one\n')
    await writeFile(join(source.path, 'two.txt'), 'after two\n')
    await rawGit(source, ['add', '--', 'two.txt'])
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const originalHead = await tip(repository)
    const originalIndex = await optionalBytes(await indexPath(repository))
    const originalSelections = h
      .request(repository)
      .files.map(file => file.selection)
    h.propose.mock.mockImplementation(async (_account, analysis) =>
      splitResponse(analysis)
    )
    const subscription = h.appStore.onDidUpdate(() => {
      const state = h.state(repository).changesState.assistedCommit
      if (state.kind === 'committing' && state.index === 1) {
        h.cancel(repository)
      }
    })
    t.after(() => subscription.dispose())
    const result = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.strictEqual(result.kind, 'cancelled')
    assert.strictEqual(await tip(repository), originalHead)
    assert.deepStrictEqual(
      await optionalBytes(await indexPath(repository)),
      originalIndex
    )
    assert.strictEqual(h.commits.mock.callCount(), 0)
    assert.strictEqual(
      h.state(repository).changesState.assistedCommit.kind,
      'idle'
    )
    h.request(repository).files.forEach((file, index) =>
      assert.ok(file.selection.equals(originalSelections[index]))
    )
    assert.strictEqual(
      await readFile(join(repository.path, 'one.txt'), 'utf8'),
      'after one\n'
    )
    assert.strictEqual(
      await readFile(join(repository.path, 'two.txt'), 'utf8'),
      'after two\n'
    )
  })

  it('Cancel after successful execution but before ready rolls back the successful result', async t => {
    const source = await seed(t, { 'file.txt': 'before\n' })
    await writeFile(join(source.path, 'file.txt'), 'after\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const originalHead = await tip(repository)
    const originalIndex = await optionalBytes(await indexPath(repository))
    const subscription = h.appStore.onDidUpdate(() => {
      if (
        h.state(repository).changesState.assistedCommit.kind === 'finishing'
      ) {
        h.cancel(repository)
      }
    })
    t.after(() => subscription.dispose())
    const result = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.strictEqual(result.kind, 'cancelled')
    assert.strictEqual(await tip(repository), originalHead)
    assert.deepStrictEqual(
      await optionalBytes(await indexPath(repository)),
      originalIndex
    )
    assert.strictEqual(h.commits.mock.callCount(), 0)
    assert.strictEqual(h.request(repository).files.length, 1)
  })

  it('never treats invalid ownership, model quota, cleanup failure or wrapped cancellation as success', async t => {
    const source = await seed(t, { 'file.txt': 'before\n' })
    await writeFile(join(source.path, 'file.txt'), 'after\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const originalIndex = await optionalBytes(await indexPath(repository))
    h.propose.mock.mockImplementation(async (_account, analysis) => ({
      ...wholeSelectionResponse(analysis),
      commits: [{ title: 'Invalid', changeIds: ['unknown-id'] }],
    }))
    assert.strictEqual(
      (
        await h.dispatcher.createCopilotAssistedCommits(
          repository,
          h.request(repository)
        )
      ).kind,
      'error'
    )
    assert.strictEqual(h.propose.mock.callCount(), 1)
    const payment = new CopilotError('Quota reached', 402, {
      paymentRequiredErrorCode: 'quota_exceeded',
      retryAfter: '60',
    })
    h.propose.mock.mockImplementation(async () => {
      throw new Error('SDK failed', { cause: payment })
    })
    const quota = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.strictEqual(quota.kind, 'error')
    if (quota.kind === 'error') {
      assert.ok(assistedCommitErrorCauses(quota.error).includes(payment))
    }
    h.propose.mock.mockImplementation(async () => {
      throw new CopilotAssistedCommitError(
        'cleanup-failed',
        'SDK cleanup failed',
        {
          cause: new CopilotAssistedCommitError('cancelled', 'Cancelled'),
          cleanupErrors: [new Error('FS cleanup failed')],
        }
      )
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
    h.propose.mock.mockImplementation(async () => {
      h.cancel(repository)
      throw new Error('SDK wrapper', {
        cause: new CopilotAssistedCommitError('cancelled', 'Cancelled'),
      })
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
    assert.strictEqual(await count(repository), 1)
    assert.deepStrictEqual(
      await optionalBytes(await indexPath(repository)),
      originalIndex
    )
    assert.strictEqual(h.commits.mock.callCount(), 0)
  })

  it('retains exact recovery ownership on external history interference and safely retries only rollback', async t => {
    const source = await seed(t, { one: 'one\n', two: 'two\n' })
    await writeFile(join(source.path, 'one'), 'ONE\n')
    await writeFile(join(source.path, 'two'), 'TWO\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const originalHead = await tip(repository)
    const originalIndex = await optionalBytes(await indexPath(repository))
    const originalTree = await rawGit(repository, [
      'rev-parse',
      `${originalHead}^{tree}`,
    ])
    let runTip: string | undefined
    let externalTip: string | undefined
    const observer = h.assisted.context['progress'].bind(h.assisted.context)
    h.assisted.context['progress'] = async (run, progress) => {
      observer(run, progress)
      if (progress.kind === 'committing' && progress.index === 1) {
        runTip = await tip(repository)
        externalTip = await rawGit(
          repository,
          ['commit-tree', originalTree, '-p', runTip],
          { stdin: 'External work\n' }
        )
        await rawGit(repository, [
          'update-ref',
          'refs/heads/external-work',
          externalTip,
        ])
        await rawGit(repository, ['update-ref', 'HEAD', externalTip, runTip])
      }
    }
    h.propose.mock.mockImplementation(async (_account, analysis) =>
      splitResponse(analysis)
    )
    const result = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.strictEqual(result.kind, 'error')
    const failure = h.state(repository).changesState.assistedCommit
    assert.ok(failure.kind === 'error' && failure.retry === 'recovery')
    assert.ok(failure.recovery?.retryToken)
    assert.strictEqual(failure.recovery.history, 'interfered')
    assert.strictEqual(h.state(repository).isCommitting, true)
    assert.strictEqual(await tip(repository), externalTip)
    assert.throws(
      () => h.dispatcher.setCommitMode(repository, 'manual'),
      /assisted commit run/
    )
    await h.dispatcher.retryCopilotAssistedCommitRecovery(
      repository,
      failure.runId
    )
    assert.strictEqual(await tip(repository), externalTip)
    assert.strictEqual(
      h.state(repository).changesState.assistedCommit.kind,
      'error'
    )
    assert.ok(runTip && externalTip)
    await rawGit(repository, ['update-ref', 'HEAD', runTip, externalTip])
    await h.dispatcher.retryCopilotAssistedCommitRecovery(
      repository,
      failure.runId
    )
    assert.strictEqual(await tip(repository), originalHead)
    assert.strictEqual(
      await rawGit(repository, ['rev-parse', 'refs/heads/external-work']),
      externalTip
    )
    assert.deepStrictEqual(
      await optionalBytes(await indexPath(repository)),
      originalIndex
    )
    assert.strictEqual(h.state(repository).isCommitting, false)
    assert.strictEqual(
      h.state(repository).changesState.assistedCommit.kind,
      'idle'
    )
    assert.strictEqual(h.propose.mock.callCount(), 1)
    assert.strictEqual(h.commits.mock.callCount(), 0)
  })

  it('preserves externally changed index bytes and reports retained recovery instead of overwriting them', async t => {
    const source = await seed(t, {
      one: 'one\n',
      two: 'two\n',
      other: 'other\n',
    })
    await writeFile(join(source.path, 'one'), 'changed one\n')
    await writeFile(join(source.path, 'two'), 'changed two\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const originalHead = await tip(repository)
    const originalIndex = await optionalBytes(await indexPath(repository))
    assert.ok(originalIndex)
    let changedIndex: Buffer | undefined
    const observer = h.assisted.context['progress'].bind(h.assisted.context)
    h.assisted.context['progress'] = async (run, progress) => {
      observer(run, progress)
      if (progress.kind === 'committing' && progress.index === 1) {
        changedIndex = Buffer.concat([
          originalIndex,
          Buffer.from('external-index-change'),
        ])
        await writeFile(await indexPath(repository), changedIndex)
      }
    }
    h.propose.mock.mockImplementation(async (_account, analysis) =>
      splitResponse(analysis)
    )
    assert.strictEqual(
      (
        await h.dispatcher.createCopilotAssistedCommits(
          repository,
          h.request(repository)
        )
      ).kind,
      'error'
    )
    const failure = h.state(repository).changesState.assistedCommit
    assert.ok(
      failure.kind === 'error' && failure.recovery?.index === 'interfered'
    )
    assert.deepStrictEqual(
      await optionalBytes(await indexPath(repository)),
      changedIndex
    )
    assert.strictEqual(await tip(repository), originalHead)
    await writeFile(await indexPath(repository), originalIndex)
    await h.dispatcher.retryCopilotAssistedCommitRecovery(
      repository,
      failure.runId
    )
    const retried = h.state(repository).changesState.assistedCommit
    if (retried.kind === 'error') {
      assert.fail(
        assistedCommitErrorCauses(retried.error)
          .map(cause => (cause instanceof Error ? cause.stack : String(cause)))
          .join('\n')
      )
    }
    assert.strictEqual(
      h.state(repository).changesState.assistedCommit.kind,
      'idle'
    )
    assert.strictEqual(h.commits.mock.callCount(), 0)
  })
})
