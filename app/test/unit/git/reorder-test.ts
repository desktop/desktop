import * as FSE from 'fs-extra'
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
import { GitProcess } from 'dugite'
import { getStatusOrThrow } from '../../helpers/status'
import { getTempFilePath } from '../../../src/lib/file-system'
import { reorder } from '../../../src/lib/git/reorder'

describe('git/reorder', () => {
  let repository: Repository
  let initialCommit: Commit

  beforeEach(async () => {
    repository = await setupEmptyRepositoryDefaultMain()
    initialCommit = await makeSampleCommit(repository, 'initialize')
  })

  it('moves first commit after the second one', async () => {
    const firstCommit = await makeSampleCommit(repository, 'first')
    const secondCommit = await makeSampleCommit(repository, 'second')

    const result = await reorder(
      repository,
      [firstCommit],
      secondCommit,
      initialCommit.sha
    )

    expect(result).toBe(RebaseResult.CompletedWithoutError)

    const log = await getCommits(repository, 'HEAD', 5)
    expect(log.length).toBe(3)
    expect(log[2].summary).toBe('initialize')
    expect(log[1].summary).toBe('second')
    expect(log[0].summary).toBe('first')
  })

  it('moves first and fourth commits after the second one respecting their order in the log', async () => {
    const firstCommit = await makeSampleCommit(repository, 'first')
    const secondCommit = await makeSampleCommit(repository, 'second')
    await makeSampleCommit(repository, 'third')
    const fourthCommit = await makeSampleCommit(repository, 'fourth')

    const result = await reorder(
      repository,
      [fourthCommit, firstCommit], // provided in opposite log order
      secondCommit,
      initialCommit.sha
    )

    expect(result).toBe(RebaseResult.CompletedWithoutError)

    const log = await getCommits(repository, 'HEAD', 5)
    expect(log.length).toBe(5)

    const summaries = log.map(c => c.summary)
    expect(summaries).toStrictEqual([
      'third',
      'fourth',
      'first',
      'second',
      'initialize',
    ])
  })

  it('moves first commit after the last one', async () => {
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

    expect(result).toBe(RebaseResult.CompletedWithoutError)

    const log = await getCommits(repository, 'HEAD', 5)
    const summaries = log.map(c => c.summary)
    expect(summaries).toStrictEqual([
      'first',
      'last',
      'third',
      'second',
      'initialize',
    ])
  })

  it('reorders using the root of the branch if last retained commit is null', async () => {
    const firstCommit = await makeSampleCommit(repository, 'first')
    await makeSampleCommit(repository, 'second')

    const result = await reorder(repository, [firstCommit], initialCommit, null)

    expect(result).toBe(RebaseResult.CompletedWithoutError)

    const log = await getCommits(repository, 'HEAD', 5)
    expect(log.length).toBe(3)

    const summaries = log.map(c => c.summary)
    expect(summaries).toStrictEqual(['second', 'first', 'initialize'])
  })

  it('handles reordering a conflicting commit', async () => {
    const firstCommit = await makeSampleCommit(repository, 'first')

    // make a commit with a commit message 'second' and adding file 'second.md'
    await makeSampleCommit(repository, 'second')

    // make a third commit modifying 'second.md' from secondCommit
    const thirdCommit = await makeSampleCommit(repository, 'third', 'second')

    // move third commit after first commit
    // Will cause a conflict due to modifications to 'second.md'  - a file that
    // does not exist in the first commit.
    const result = await reorder(
      repository,
      [thirdCommit],
      firstCommit,
      initialCommit.sha
    )

    expect(result).toBe(RebaseResult.ConflictsEncountered)

    let status = await getStatusOrThrow(repository)
    let { files } = status.workingDirectory

    // resolve conflicts by adding the conflicting file
    await GitProcess.exec(
      ['add', Path.join(repository.path, 'second.md')],
      repository.path
    )

    // If there are conflicts, we need to resend in git editor for changing the
    // git message on continue
    const thirdMessagePath = await getTempFilePath('reorderCommitMessage-third')
    await FSE.writeFile(thirdMessagePath, 'third - fixed')

    // continue rebase
    let continueResult = await continueRebase(
      repository,
      files,
      undefined,
      undefined,
      `cat "${thirdMessagePath}" >`
    )

    // This will now conflict with the 'third' commit since it is going to now
    // apply the 'second' commit which now modifies the same lines in the
    // 'second.md' that the previous commit does.
    expect(continueResult).toBe(RebaseResult.ConflictsEncountered)

    status = await getStatusOrThrow(repository)
    files = status.workingDirectory.files

    await FSE.writeFile(
      Path.join(repository.path, 'second.md'),
      '# resolve conflict from putting "third" before "second"'
    )

    const secondMessagePath = await getTempFilePath(
      'reorderCommitMessage-second'
    )
    await FSE.writeFile(secondMessagePath, 'second - fixed')

    continueResult = await continueRebase(
      repository,
      files,
      undefined,
      undefined,
      `cat "${secondMessagePath}" >`
    )
    expect(continueResult).toBe(RebaseResult.CompletedWithoutError)

    const log = await getCommits(repository, 'HEAD', 5)
    const summaries = log.map(c => c.summary)
    expect(summaries).toStrictEqual([
      'second - fixed',
      'third - fixed',
      'first',
      'initialize',
    ])
  })

  it('returns error on invalid lastRetainedCommitRef', async () => {
    const firstCommit = await makeSampleCommit(repository, 'first')
    const secondCommit = await makeSampleCommit(repository, 'second')

    const result = await reorder(
      repository,
      [secondCommit],
      firstCommit,
      'INVALID INVALID'
    )

    expect(result).toBe(RebaseResult.Error)

    // Rebase will not start - As it won't be able retrieve a commits to build a
    // todo and then interactive rebase would fail for bad revision. Added logic
    // to short circuit to prevent unnecessary attempt at an interactive rebase.
    const isRebaseStillOngoing = await getRebaseInternalState(repository)
    expect(isRebaseStillOngoing).toBeNull()
  })

  it('returns error on invalid base commit', async () => {
    await makeSampleCommit(repository, 'first')
    const secondCommit = await makeSampleCommit(repository, 'second')

    const badCommit = { ...secondCommit, sha: 'INVALID', summary: 'INVALID' }
    const result = await reorder(
      repository,
      [secondCommit],
      badCommit,
      initialCommit.sha
    )

    expect(result).toBe(RebaseResult.Error)

    // Rebase should not start - if we did attempt this, it could result in
    // dropping commits.
    const isRebaseStillOngoing = await getRebaseInternalState(repository)
    expect(isRebaseStillOngoing).toBeNull()
  })

  it('returns error when no commits are reordered', async () => {
    const first = await makeSampleCommit(repository, 'first')
    await makeSampleCommit(repository, 'second')

    const result = await reorder(repository, [], first, initialCommit.sha)

    expect(result).toBe(RebaseResult.Error)

    // Rebase should not start - technically there would be no harm in this
    // rebase as it would just replay history, but we should not use reorder to
    // replay history.
    const isRebaseStillOngoing = await getRebaseInternalState(repository)
    expect(isRebaseStillOngoing).toBeNull()
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

  return (await getCommit(repository, 'HEAD'))!
}
