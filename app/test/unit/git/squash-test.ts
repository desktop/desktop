import { getCommit, getCommits, RebaseResult } from '../../../src/lib/git'
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
