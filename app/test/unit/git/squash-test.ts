import * as FSE from 'fs-extra'
import * as Path from 'path'
import {
  continueRebase,
  getChangedFiles,
  getCommit,
  getCommits,
  getRebaseInternalState,
  RebaseResult,
} from '../../../src/lib/git'
import { Commit } from '../../../src/models/commit'
import { Repository } from '../../../src/models/repository'
import { setupEmptyRepositoryDefaultMain } from '../../helpers/repositories'
import { makeCommit } from '../../helpers/repository-scaffolding'
import { squash } from '../../../src/lib/git/squash'
import { exec } from 'dugite'
import { getStatusOrThrow } from '../../helpers/status'
import { getTempFilePath } from '../../../src/lib/file-system'

describe('git/cherry-pick', () => {
  let repository: Repository
  let initialCommit: Commit

  beforeEach(async () => {
    repository = await setupEmptyRepositoryDefaultMain()
    initialCommit = await makeSquashCommit(repository, 'initialize')
  })

  it('squashes one commit onto the next (non-conflicting)', async () => {
    const firstCommit = await makeSquashCommit(repository, 'first')
    const secondCommit = await makeSquashCommit(repository, 'second')

    const result = await squash(
      repository,
      [secondCommit],
      firstCommit,
      initialCommit.sha,
      'Test Summary\n\nTest Body'
    )

    expect(result).toBe(RebaseResult.CompletedWithoutError)

    const log = await getCommits(repository, 'HEAD', 5)
    const squashed = log[0]
    expect(squashed.summary).toBe('Test Summary')
    expect(squashed.body).toBe('Test Body\n')
    expect(log.length).toBe(2)

    // verify squashed commit contains changes from squashed commits
    const squashedChangesetData = await getChangedFiles(
      repository,
      squashed.sha
    )
    const squashedFilePaths = squashedChangesetData.files
      .map(f => f.path)
      .join(' ')
    expect(squashedFilePaths).toContain('first.md')
    expect(squashedFilePaths).toContain('second.md')
  })

  it('returns error when squashOnto is in the toSquash array', async () => {
    const firstCommit = await makeSquashCommit(repository, 'first')
    const secondCommit = await makeSquashCommit(repository, 'second')

    const result = await squash(
      repository,
      [firstCommit, secondCommit],
      firstCommit,
      initialCommit.sha,
      'Test Summary\n\nTest Body'
    )

    expect(result).toBe(RebaseResult.Error)
  })

  it('squashes multiple commit onto one (non-conflicting)', async () => {
    const firstCommit = await makeSquashCommit(repository, 'first')
    const secondCommit = await makeSquashCommit(repository, 'second')
    const thirdCommit = await makeSquashCommit(repository, 'third')
    const fourthCommit = await makeSquashCommit(repository, 'fourth')

    const result = await squash(
      repository,
      [secondCommit, thirdCommit, fourthCommit],
      firstCommit,
      initialCommit.sha,
      'Test Summary\n\nTest Body'
    )

    expect(result).toBe(RebaseResult.CompletedWithoutError)

    const log = await getCommits(repository, 'HEAD', 5)
    const squashed = log[0]
    expect(squashed.summary).toBe('Test Summary')
    expect(squashed.body).toBe('Test Body\n')
    expect(log.length).toBe(2)

    // verify squashed commit contains changes from squashed commits
    const squashedChangesetData = await getChangedFiles(
      repository,
      squashed.sha
    )
    const squashedFilePaths = squashedChangesetData.files
      .map(f => f.path)
      .join(' ')
    expect(squashedFilePaths).toContain('first.md')
    expect(squashedFilePaths).toContain('second.md')
    expect(squashedFilePaths).toContain('third.md')
    expect(squashedFilePaths).toContain('fourth.md')
  })

  it('squashes using the root of the branch if last retained commit is null', async () => {
    const firstCommit = await makeSquashCommit(repository, 'first')
    const secondCommit = await makeSquashCommit(repository, 'second')

    let log = await getCommits(repository, 'HEAD', 5)
    expect(log.length).toBe(3)

    const result = await squash(
      repository,
      [firstCommit, secondCommit],
      initialCommit, // first in branch (root) commit.
      null,
      'Test Summary\n\nTest Body'
    )

    expect(result).toBe(RebaseResult.CompletedWithoutError)

    log = await getCommits(repository, 'HEAD', 5)
    const squashed = log[0]
    expect(squashed.summary).toBe('Test Summary')
    expect(squashed.body).toBe('Test Body\n')
    expect(log.length).toBe(1)

    // verify squashed commit contains changes from squashed commits
    const squashedChangesetData = await getChangedFiles(
      repository,
      squashed.sha
    )
    const squashedFilePaths = squashedChangesetData.files
      .map(f => f.path)
      .join(' ')
    expect(squashedFilePaths).toContain('initialize')
    expect(squashedFilePaths).toContain('first.md')
    expect(squashedFilePaths).toContain('second.md')
  })

  it('squashes multiple commit non-sequential commits (reorders, non-conflicting)', async () => {
    const firstCommit = await makeSquashCommit(repository, 'first')
    await makeSquashCommit(repository, 'second')
    const thirdCommit = await makeSquashCommit(repository, 'third')
    await makeSquashCommit(repository, 'fourth')
    const fifthCommit = await makeSquashCommit(repository, 'fifth')

    // From oldest to newest, log looks like:
    // - initial commit
    // - 'first' commit
    // - 'second' commit
    // - 'third' commit
    // - 'fourth' commit
    // - 'fifth' commit

    // Squashing 'first' and 'fifth' onto 'third'
    // Thus, reordering to 'second', 'first - third - fifth', 'fourth'
    const result = await squash(
      repository,
      [fifthCommit, firstCommit], // provided in opposite log order
      thirdCommit,
      initialCommit.sha,
      ''
    )

    expect(result).toBe(RebaseResult.CompletedWithoutError)

    // From oldest to newest, log should look like:
    // - initial commit - log[2]
    // - the squashed commit 'first third fifth` - order by log history
    // - 'fourth' commit - log[0]
    const log = await getCommits(repository, 'HEAD', 5)
    const squashed = log[1]
    expect(squashed.summary).toBe('first')
    expect(squashed.body).toBe('third\n\nfifth\n')
    expect(log[0].summary).toBe('fourth')
    expect(log.length).toBe(4)

    // verify squashed commit contains changes from squashed commits
    const squashedChangesetData = await getChangedFiles(
      repository,
      squashed.sha
    )
    const squashedFilePaths = squashedChangesetData.files
      .map(f => f.path)
      .join(' ')
    expect(squashedFilePaths).toContain('first.md')
    expect(squashedFilePaths).toContain('third.md')
    expect(squashedFilePaths).toContain('fifth.md')
    expect(squashedFilePaths).not.toContain('second.md')
    expect(squashedFilePaths).not.toContain('fourth.md')
  })

  it('handles squashing a conflicting commit', async () => {
    const firstCommit = await makeSquashCommit(repository, 'first')

    // make a commit with a commit message 'second' and adding file 'second.md'
    await makeSquashCommit(repository, 'second')

    // make a third commit modifying 'second.md' from secondCommit
    const thirdCommit = await makeSquashCommit(repository, 'third', 'second')

    // squash third commit onto first commit
    // Will cause a conflict due to modifications to 'second.md'  - a file that
    // does not exist in the first commit.
    const result = await squash(
      repository,
      [thirdCommit],
      firstCommit,
      initialCommit.sha,
      'Test Summary\n\nTest Body'
    )

    expect(result).toBe(RebaseResult.ConflictsEncountered)

    let status = await getStatusOrThrow(repository)
    let { files } = status.workingDirectory

    // resolve conflicts by adding the conflicting file
    await exec(
      ['add', Path.join(repository.path, 'second.md')],
      repository.path
    )

    // If there are conflicts, we need to resend in git editor for changing the
    // git message on continue
    const messagePath = await getTempFilePath('squashCommitMessage')
    await FSE.writeFile(messagePath, 'Test Summary\n\nTest Body')

    // continue rebase
    let continueResult = await continueRebase(
      repository,
      files,
      undefined,
      undefined,
      `cat "${messagePath}" >`
    )

    // This will now conflict with the 'second' commit since it is going to now
    // apply the second commit which now modifies the same lines in the
    // 'second.md' that the squashed first commit does.
    expect(continueResult).toBe(RebaseResult.ConflictsEncountered)

    status = await getStatusOrThrow(repository)
    files = status.workingDirectory.files

    await FSE.writeFile(
      Path.join(repository.path, 'second.md'),
      '# resolve conflict from adding add after resolving squash'
    )

    continueResult = await continueRebase(
      repository,
      files,
      undefined,
      undefined,
      // Only reason I did this here is to show it does not cause harm.
      // In case of multiple commits being squashed/reordered before the squash
      // completes, we may not be able to tell which conflict the squash
      // message will need to go after so we will be sending it on all
      // continues.
      `cat "${messagePath}" >`
    )
    expect(continueResult).toBe(RebaseResult.CompletedWithoutError)

    const log = await getCommits(repository, 'HEAD', 5)
    expect(log.length).toBe(3)
    const squashed = log[1]
    expect(squashed.summary).toBe('Test Summary')
    expect(squashed.body).toBe('Test Body\n')

    // verify squashed commit contains changes from squashed commits
    const squashedChangesetData = await getChangedFiles(
      repository,
      squashed.sha
    )
    const squashedFilePaths = squashedChangesetData.files
      .map(f => f.path)
      .join(' ')
    expect(squashedFilePaths).toContain('first.md')
    expect(squashedFilePaths).toContain('second.md')
  })

  it('squashes with default merged commit message/description if commit message not provided', async () => {
    const firstCommit = await makeSquashCommit(repository, 'first')
    const secondCommit = await makeSquashCommit(repository, 'second')

    const result = await squash(
      repository,
      [secondCommit],
      firstCommit,
      initialCommit.sha,
      ''
    )
    expect(result).toBe(RebaseResult.CompletedWithoutError)

    const log = await getCommits(repository, 'HEAD', 5)
    const squashed = log[0]
    expect(squashed.summary).toBe('first')
    expect(squashed.body).toBe('second\n')
    expect(log.length).toBe(2)
  })

  it('returns error on invalid lastRetainedCommitRef', async () => {
    const firstCommit = await makeSquashCommit(repository, 'first')
    const secondCommit = await makeSquashCommit(repository, 'second')

    const result = await squash(
      repository,
      [secondCommit],
      firstCommit,
      'INVALID INVALID',
      'Test Summary\n\nTest Body'
    )

    expect(result).toBe(RebaseResult.Error)

    // Rebase will not start - As it won't be able retrieve a commits to build a
    // todo and then interactive rebase would fail for bad revision. Added logic
    // to short circuit to prevent unnecessary attempt at an interactive rebase.
    const isRebaseStillOngoing = await getRebaseInternalState(repository)
    expect(isRebaseStillOngoing !== null).toBeFalse()
  })

  it('returns error on invalid commit to squashOnto', async () => {
    await makeSquashCommit(repository, 'first')
    const secondCommit = await makeSquashCommit(repository, 'second')

    const badCommit = { ...secondCommit, sha: 'INVALID', summary: 'INVALID' }
    const result = await squash(
      repository,
      [secondCommit],
      badCommit,
      initialCommit.sha,
      'Test Summary\n\nTest Body'
    )

    expect(result).toBe(RebaseResult.Error)

    // Rebase should not start - if we did attempt this, it could result in
    // dropping commits.
    const isRebaseStillOngoing = await getRebaseInternalState(repository)
    expect(isRebaseStillOngoing !== null).toBeFalse()
  })

  it('returns error on empty toSquash', async () => {
    const first = await makeSquashCommit(repository, 'first')
    await makeSquashCommit(repository, 'second')

    const result = await squash(
      repository,
      [],
      first,
      initialCommit.sha,
      'Test Summary\n\nTest Body'
    )

    expect(result).toBe(RebaseResult.Error)

    // Rebase should not start - technically there would be no harm in this
    // rebase as it would just replay history, but we should not use squash to
    // replay history.
    const isRebaseStillOngoing = await getRebaseInternalState(repository)
    expect(isRebaseStillOngoing !== null).toBeFalse()
  })
})

async function makeSquashCommit(
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
