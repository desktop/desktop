import * as Path from 'path'
import * as FSE from 'fs-extra'
import { getCommit, getCommits, git } from '../../../src/lib/git'
import { CommitOneLine } from '../../../src/models/commit'
import { Repository } from '../../../src/models/repository'
import { setupEmptyRepositoryDefaultMain } from '../../helpers/repositories'
import { makeCommit } from '../../helpers/repository-scaffolding'

describe('git/cherry-pick', () => {
  let repository: Repository
  let initialCommit: CommitOneLine

  beforeEach(async () => {
    repository = await setupEmptyRepositoryDefaultMain()
    initialCommit = await makeSquashCommit(repository, 'initialize')
  })

  it('squashes one commit onto the next (non-conflicting)', async () => {
    const firstCommit = await makeSquashCommit(repository, 'first')
    const firstShortSha = firstCommit.sha.slice(0, 7)
    const secondCommit = await makeSquashCommit(repository, 'second')
    const secondShortSha = secondCommit.sha.slice(0, 7)
    const thirdCommit = await makeSquashCommit(repository, 'third')
    const thirdShortSha = thirdCommit.sha.slice(0, 7)

    const path = Path.join(repository.path, 'test')
    await FSE.writeFile(
      Path.join(repository.path, 'test'),
      `pick ${firstShortSha} 1\nsquash ${secondShortSha} 2\nsquash ${thirdShortSha} 3\n`
    )

    await git(
      [
        '-c',
        `sequence.editor=cat "${path}" >`,
        'rebase',
        '-i',
        initialCommit.sha,
      ],
      repository.path,
      'squash',
      {
        env: {
          GIT_EDITOR: ':',
        },
      }
    )

    const log = await getCommits(repository, 'HEAD', 5)
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
