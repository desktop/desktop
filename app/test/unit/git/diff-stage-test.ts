import { describe, it } from 'node:test'
import assert from 'node:assert'
import { exec } from 'dugite'

import { DiffType, ITextDiff } from '../../../src/models/diff'
import { setupEmptyRepository } from '../../helpers/repositories'
import { makeCommit, switchTo } from '../../helpers/repository-scaffolding'
import { getResolutionDiff } from '../../../src/lib/git'

describe('git/diff/getResolutionDiff (stage mode)', () => {
  it('diffs ours (:2) against the on-disk conflict-marker file', async t => {
    const repo = await setupEmptyRepository(t)

    await makeCommit(repo, {
      entries: [{ path: 'file.txt', contents: 'line 1\nline 2\nline 3\n' }],
      commitMessage: 'base',
    })

    await switchTo(repo, 'feature')
    await makeCommit(repo, {
      entries: [
        { path: 'file.txt', contents: 'line 1\nfeature change\nline 3\n' },
      ],
      commitMessage: 'feature',
    })

    await exec(['checkout', 'master'], repo.path)
    await makeCommit(repo, {
      entries: [
        { path: 'file.txt', contents: 'line 1\nmaster change\nline 3\n' },
      ],
      commitMessage: 'master',
    })

    await exec(['merge', 'feature', '--no-commit'], repo.path)

    // Diff: on-disk (conflict markers) → :2 (master's version)
    const diff = await getResolutionDiff(repo, 'file.txt', { stage: 'ours' })

    assert.equal(diff.kind, DiffType.Text)
    const textDiff = diff as ITextDiff
    assert(textDiff.hunks.length > 0)
    // The conflict markers from the on-disk file should appear as removed
    assert(
      textDiff.text.includes('-feature change'),
      'should remove the other side'
    )
  })

  it('diffs theirs (:3) against the on-disk conflict-marker file', async t => {
    const repo = await setupEmptyRepository(t)

    await makeCommit(repo, {
      entries: [{ path: 'file.txt', contents: 'line 1\nline 2\nline 3\n' }],
      commitMessage: 'base',
    })

    await switchTo(repo, 'feature')
    await makeCommit(repo, {
      entries: [
        { path: 'file.txt', contents: 'line 1\nfeature change\nline 3\n' },
      ],
      commitMessage: 'feature',
    })

    await exec(['checkout', 'master'], repo.path)
    await makeCommit(repo, {
      entries: [
        { path: 'file.txt', contents: 'line 1\nmaster change\nline 3\n' },
      ],
      commitMessage: 'master',
    })

    await exec(['merge', 'feature', '--no-commit'], repo.path)

    // Diff: on-disk (conflict markers) → :3 (feature's version)
    const diff = await getResolutionDiff(repo, 'file.txt', { stage: 'theirs' })

    assert.equal(diff.kind, DiffType.Text)
    const textDiff = diff as ITextDiff
    assert(textDiff.hunks.length > 0)
    assert(
      textDiff.text.includes('-master change'),
      'should remove the other side'
    )
  })

  it('shows deletion diff when file deleted in requested stage', async t => {
    const repo = await setupEmptyRepository(t)

    await makeCommit(repo, {
      entries: [{ path: 'file.txt', contents: 'base content\n' }],
      commitMessage: 'base',
    })

    await switchTo(repo, 'feature')
    await makeCommit(repo, {
      entries: [{ path: 'file.txt', contents: null }],
      commitMessage: 'feature deletes file',
    })

    await exec(['checkout', 'master'], repo.path)
    await makeCommit(repo, {
      entries: [{ path: 'file.txt', contents: 'master modified\n' }],
      commitMessage: 'master modifies file',
    })

    await exec(['merge', 'feature', '--no-commit'], repo.path)

    // file.txt was deleted in feature (:3 doesn't exist) → empty target.
    // Diff should show the on-disk content being removed entirely.
    const diff = await getResolutionDiff(repo, 'file.txt', { stage: 'theirs' })

    assert.equal(diff.kind, DiffType.Text)
    const textDiff = diff as ITextDiff
    assert(
      textDiff.text.includes('-master modified'),
      'should show on-disk content as deleted'
    )
  })

  it('respects hideWhitespaceInDiff flag', async t => {
    const repo = await setupEmptyRepository(t)

    await makeCommit(repo, {
      entries: [{ path: 'file.txt', contents: 'hello world\n' }],
      commitMessage: 'base',
    })

    await switchTo(repo, 'feature')
    await makeCommit(repo, {
      entries: [{ path: 'file.txt', contents: 'hello  world\nextra\n' }],
      commitMessage: 'feature',
    })

    await exec(['checkout', 'master'], repo.path)
    await makeCommit(repo, {
      entries: [{ path: 'file.txt', contents: 'hello world\nother\n' }],
      commitMessage: 'master',
    })

    await exec(['merge', 'feature', '--no-commit'], repo.path)

    // With whitespace hidden, spacing-only changes should be suppressed
    const diff = await getResolutionDiff(
      repo,
      'file.txt',
      { stage: 'theirs' },
      true
    )

    assert.equal(diff.kind, DiffType.Text)
    const textDiff = diff as ITextDiff
    // The content addition (extra) from feature should still appear
    assert(
      textDiff.text.includes('extra'),
      'should show non-whitespace changes'
    )
  })
})
