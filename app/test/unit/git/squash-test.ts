import {
  getChangedFiles,
  getCommit,
  getCommits,
  RebaseResult,
} from '../../../src/lib/git'
import { CommitOneLine } from '../../../src/models/commit'
import { Repository } from '../../../src/models/repository'
import { setupEmptyRepositoryDefaultMain } from '../../helpers/repositories'
import { makeCommit } from '../../helpers/repository-scaffolding'
import { squash } from '../../../src/lib/git/squash'

describe('git/cherry-pick', () => {
  let repository: Repository
  let initialCommit: CommitOneLine

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
      'Test Summary',
      'Test Body'
    )

    expect(result).toBe(RebaseResult.CompletedWithoutError)

    const log = await getCommits(repository, 'HEAD', 5)
    const squashed = log[0]
    expect(squashed.summary).toBe('Test Summary')
    expect(squashed.body).toBe('Test Body\n')
    expect(log.length).toBe(2)

    // verify squashed commit contains changes from squashed commits
    const squashedFiles = await getChangedFiles(repository, squashed.sha)
    const squashedFilePaths = squashedFiles.map(f => f.path).join(' ')
    expect(squashedFilePaths.includes('first.md')).toBeTrue()
    expect(squashedFilePaths.includes('second.md')).toBeTrue()
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
      'Test Summary',
      'Test Body'
    )

    expect(result).toBe(RebaseResult.CompletedWithoutError)

    const log = await getCommits(repository, 'HEAD', 5)
    const squashed = log[0]
    expect(squashed.summary).toBe('Test Summary')
    expect(squashed.body).toBe('Test Body\n')
    expect(log.length).toBe(2)

    // verify squashed commit contains changes from squashed commits
    const squashedFiles = await getChangedFiles(repository, squashed.sha)
    const squashedFilePaths = squashedFiles.map(f => f.path).join(' ')
    expect(squashedFilePaths.includes('first.md')).toBeTrue()
    expect(squashedFilePaths.includes('second.md')).toBeTrue()
    expect(squashedFilePaths.includes('third.md')).toBeTrue()
    expect(squashedFilePaths.includes('fourth.md')).toBeTrue()
  })

  it('squashes multiple commit non-sequential commits (reorders, non-conflicting)', async () => {
    const firstCommit = await makeSquashCommit(repository, 'first')
    const secondCommit = await makeSquashCommit(repository, 'second')
    await makeSquashCommit(repository, 'third')
    const fourthCommit = await makeSquashCommit(repository, 'fourth')

    // From oldest to newest, log looks like:
    // - initial commit
    // - 'first' commit
    // - 'second' commit
    // - 'third' commit
    // - 'fourth' commit

    // Squashing 'second' and 'fourth' onto 'first'
    // Thus, reordering 'fourth' to be before 'third'
    const result = await squash(
      repository,
      [secondCommit, fourthCommit],
      firstCommit,
      initialCommit.sha,
      'Test Summary',
      'Test Body'
    )

    expect(result).toBe(RebaseResult.CompletedWithoutError)

    // From oldest to newest, log should look like:
    // - initial commit - log[2]
    // - 'third' commit - log[1]
    // - The squashed commit 'Test Summary' - log[0]
    const log = await getCommits(repository, 'HEAD', 5)
    const squashed = log[0]
    expect(squashed.summary).toBe('Test Summary')
    expect(squashed.body).toBe('Test Body\n')
    expect(log[1].summary).toBe('third')
    expect(log.length).toBe(3)

    // verify squashed commit contains changes from squashed commits
    const squashedFiles = await getChangedFiles(repository, squashed.sha)
    const squashedFilePaths = squashedFiles.map(f => f.path).join(' ')
    expect(squashedFilePaths.includes('first.md')).toBeTrue()
    expect(squashedFilePaths.includes('second.md')).toBeTrue()
    expect(squashedFilePaths.includes('fourth.md')).toBeTrue()
    expect(squashedFilePaths.includes('third.md')).toBeFalse()
  })
  })
})

async function makeSquashCommit(
  repository: Repository,
  desc: string
): Promise<CommitOneLine> {
  const commitTree = {
    commitMessage: desc,
    entries: [
      {
        path: desc + '.md',
        contents: '# ' + desc + ' \n',
      },
    ],
  }
  await makeCommit(repository, commitTree)

  return (await getCommit(repository, 'HEAD'))!
}
