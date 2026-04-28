import { describe, it } from 'node:test'
import assert from 'node:assert'
import { writeFile } from 'fs/promises'
import * as Path from 'path'
import {
  continueRebase,
  getCommit,
  getCommits,
  getRebaseInternalState,
  RebaseResult,
} from '../../../src/lib/git'
import { Commit } from '../../../src/models/commit'
import { Repository } from '../../../src/models/repository'
import { setupEmptyRepositoryDefaultMain } from '../../helpers/repositories'
import { makeCommit } from '../../helpers/repository-scaffolding'
import { exec } from 'dugite'
import { getStatusOrThrow } from '../../helpers/status'
import { getTempFilePath } from '../../../src/lib/file-system'
import { reorder } from '../../../src/lib/git/reorder'

describe('git/reorder', () => {
  it('moves second commit before the first one', async t => {
    const repository = await setupEmptyRepositoryDefaultMain(t)
    const initialCommit = await makeSampleCommit(repository, 'initialize')

    const firstCommit = await makeSampleCommit(repository, 'first')
    const secondCommit = await makeSampleCommit(repository, 'second')

    const result = await reorder(
      repository,
      [secondCommit],
      firstCommit,
      initialCommit.sha
    )

    assert.equal(result, RebaseResult.CompletedWithoutError)

    const log = await getCommits(repository, 'HEAD', 5)
    assert.equal(log.length, 3)
    assert.equal(log[2].summary, 'initialize')
    assert.equal(log[1].summary, 'second')
    assert.equal(log[0].summary, 'first')
  })

  it('moves first and fourth commits after the second one respecting their order in the log', async t => {
    const repository = await setupEmptyRepositoryDefaultMain(t)
    const initialCommit = await makeSampleCommit(repository, 'initialize')

    const firstCommit = await makeSampleCommit(repository, 'first')
    await makeSampleCommit(repository, 'second')
    const thirdCommit = await makeSampleCommit(repository, 'third')
    const fourthCommit = await makeSampleCommit(repository, 'fourth')

    const result = await reorder(
      repository,
      [fourthCommit, firstCommit], // provided in opposite log order
      thirdCommit,
      initialCommit.sha
    )

    assert.equal(result, RebaseResult.CompletedWithoutError)

    const log = await getCommits(repository, 'HEAD', 5)
    assert.equal(log.length, 5)

    const summaries = log.map(c => c.summary)
    assert.deepStrictEqual(summaries, [
      'third',
      'fourth',
      'first',
      'second',
      'initialize',
    ])
  })

  it('moves first commit after the last one', async t => {
    const repository = await setupEmptyRepositoryDefaultMain(t)
    const initialCommit = await makeSampleCommit(repository, 'initialize')

    const firstCommit = await makeSampleCommit(repository, 'first')
    await makeSampleCommit(repository, 'second')
    await makeSampleCommit(repository, 'third')
    await makeSampleCommit(repository, 'last')

    const result = await reorder(
      repository,
      [firstCommit],
      null,
      initialCommit.sha
    )

    assert.equal(result, RebaseResult.CompletedWithoutError)

    const log = await getCommits(repository, 'HEAD', 5)
    const summaries = log.map(c => c.summary)
    assert.deepStrictEqual(summaries, [
      'first',
      'last',
      'third',
      'second',
      'initialize',
    ])
  })

  it('reorders using the root of the branch if last retained commit is null', async t => {
    const repository = await setupEmptyRepositoryDefaultMain(t)
    const initialCommit = await makeSampleCommit(repository, 'initialize')

    const firstCommit = await makeSampleCommit(repository, 'first')
    await makeSampleCommit(repository, 'second')

    const result = await reorder(repository, [firstCommit], initialCommit, null)

    assert.equal(result, RebaseResult.CompletedWithoutError)

    const log = await getCommits(repository, 'HEAD', 5)
    assert.equal(log.length, 3)

    const summaries = log.map(c => c.summary)
    assert.deepStrictEqual(summaries, ['second', 'initialize', 'first'])
  })

  it('handles reordering a conflicting commit', async t => {
    const repository = await setupEmptyRepositoryDefaultMain(t)
    const initialCommit = await makeSampleCommit(repository, 'initialize')

    await makeSampleCommit(repository, 'first')

    // make a commit with a commit message 'second' and adding file 'second.md'
    const secondCommit = await makeSampleCommit(repository, 'second')

    // make a third commit modifying 'second.md' from secondCommit
    const thirdCommit = await makeSampleCommit(repository, 'third', 'second')

    // move third commit before second commit
    // Will cause a conflict due to modifications to 'second.md'  - a file that
    // does not exist in the first commit.
    const result = await reorder(
      repository,
      [thirdCommit],
      secondCommit,
      initialCommit.sha
    )

    assert.equal(result, RebaseResult.ConflictsEncountered)

    let status = await getStatusOrThrow(repository)
    let { files } = status.workingDirectory

    // resolve conflicts by adding the conflicting file
    await exec(
      ['add', Path.join(repository.path, 'second.md')],
      repository.path
    )

    // If there are conflicts, we need to resend in git editor for changing the
    // git message on continue
    const thirdMessagePath = await getTempFilePath('reorderCommitMessage-third')
    await writeFile(thirdMessagePath, 'third - fixed')

    // continue rebase
    let continueResult = await continueRebase(repository, files, undefined, {
      gitEditor: `cat "${thirdMessagePath}" >`,
    })

    // This will now conflict with the 'third' commit since it is going to now
    // apply the 'second' commit which now modifies the same lines in the
    // 'second.md' that the previous commit does.
    assert.equal(continueResult, RebaseResult.ConflictsEncountered)

    status = await getStatusOrThrow(repository)
    files = status.workingDirectory.files

    await writeFile(
      Path.join(repository.path, 'second.md'),
      '# resolve conflict from putting "third" before "second"'
    )

    const secondMessagePath = await getTempFilePath(
      'reorderCommitMessage-second'
    )
    await writeFile(secondMessagePath, 'second - fixed')

    continueResult = await continueRebase(repository, files, undefined, {
      gitEditor: `cat "${secondMessagePath}" >`,
    })
    assert.equal(continueResult, RebaseResult.CompletedWithoutError)

    const log = await getCommits(repository, 'HEAD', 5)
    const summaries = log.map(c => c.summary)
    assert.deepStrictEqual(summaries, [
      'second - fixed',
      'third - fixed',
      'first',
      'initialize',
    ])
  })

  it('returns error on invalid lastRetainedCommitRef', async t => {
    const repository = await setupEmptyRepositoryDefaultMain(t)
    await makeSampleCommit(repository, 'initialize')

    const firstCommit = await makeSampleCommit(repository, 'first')
    const secondCommit = await makeSampleCommit(repository, 'second')

    const result = await reorder(
      repository,
      [secondCommit],
      firstCommit,
      'INVALID INVALID'
    )

    assert.equal(result, RebaseResult.Error)

    // Rebase will not start - As it won't be able retrieve a commits to build a
    // todo and then interactive rebase would fail for bad revision. Added logic
    // to short circuit to prevent unnecessary attempt at an interactive rebase.
    const isRebaseStillOngoing = await getRebaseInternalState(repository)
    assert(isRebaseStillOngoing === null)
  })

  it('returns error on invalid base commit', async t => {
    const repository = await setupEmptyRepositoryDefaultMain(t)
    const initialCommit = await makeSampleCommit(repository, 'initialize')

    await makeSampleCommit(repository, 'first')
    const secondCommit = await makeSampleCommit(repository, 'second')

    const badCommit = { ...secondCommit, sha: 'INVALID', summary: 'INVALID' }
    const result = await reorder(
      repository,
      [secondCommit],
      badCommit,
      initialCommit.sha
    )

    assert.equal(result, RebaseResult.Error)

    // Rebase should not start - if we did attempt this, it could result in
    // dropping commits.
    const isRebaseStillOngoing = await getRebaseInternalState(repository)
    assert(isRebaseStillOngoing === null)
  })

  it('returns error when no commits are reordered', async t => {
    const repository = await setupEmptyRepositoryDefaultMain(t)
    const initialCommit = await makeSampleCommit(repository, 'initialize')

    const first = await makeSampleCommit(repository, 'first')
    await makeSampleCommit(repository, 'second')

    const result = await reorder(repository, [], first, initialCommit.sha)

    assert.equal(result, RebaseResult.Error)

    // Rebase should not start - technically there would be no harm in this
    // rebase as it would just replay history, but we should not use reorder to
    // replay history.
    const isRebaseStillOngoing = await getRebaseInternalState(repository)
    assert(isRebaseStillOngoing === null)
  })
})

async function makeSampleCommit(
  repository: Repository,
  desc: string,
  file?: string
): Promise<Commit> {
  file = file || desc
  const commitTree = {
    commitMessage: desc,
    entries: [
      {
        path: file + '.md',
        contents: '# ' + desc + ' \n',
      },
    ],
  }
  await makeCommit(repository, commitTree)

  const commit = await getCommit(repository, 'HEAD')
  assert(commit !== null, `Couldn't find HEAD after committing!`)
  return commit
}
