import { Repository } from '../../src/models/repository'
import { setupEmptyRepository } from './repositories'
import { makeCommit, switchTo, createBranch } from './repository-scaffolding'

/**
 * Creates a test repository to be used as the branch for testing rebase
 * behaviour with:
 *  - two commits on `master`,
 *  - one commit on `firstBranchName`, which is based on `master`
 *  - one commit on `secondBranchName`, which is also based on `master`
 */
export async function createRepository(
  firstBranchName: string,
  secondBranchName: string
): Promise<Repository> {
  const repository = await setupEmptyRepository()

  // make two commits on `master` to setup the README

  const firstCommit = {
    commitMessage: 'First!',
    entries: [
      {
        path: 'README.md',
        contents: '# HELLO WORLD! \n',
      },
    ],
  }

  await makeCommit(repository, firstCommit)

  const secondCommit = {
    commitMessage: 'Second!',
    entries: [
      {
        path: 'THING.md',
        contents: '# HELLO WORLD! \nTHINGS GO HERE\n',
      },
      {
        path: 'OTHER.md',
        contents: '# HELLO WORLD! \nTHINGS GO HERE\n',
      },
      {
        path: 'THIRD.md',
        contents: 'nothing goes here',
      },
    ],
  }

  await makeCommit(repository, secondCommit)

  await createBranch(repository, firstBranchName, 'HEAD')
  await createBranch(repository, secondBranchName, 'HEAD')

  await switchTo(repository, firstBranchName)

  const baseBranchCommit = {
    commitMessage: 'Base Branch!',
    entries: [
      {
        path: 'THING.md',
        contents: '# HELLO WORLD! \nTHINGS GO HERE\nBASE BRANCH UNDERWAY\n',
      },
      {
        path: 'OTHER.md',
        contents:
          '# HELLO WORLD! \nTHINGS GO HERE\nALSO BASE BRANCH UNDERWAY\n',
      },
    ],
  }

  await makeCommit(repository, baseBranchCommit)

  await switchTo(repository, secondBranchName)

  const featureBranchCommit = {
    commitMessage: 'Feature Branch!',
    entries: [
      {
        path: 'THING.md',
        contents: '# HELLO WORLD! \nTHINGS GO HERE\nFEATURE BRANCH UNDERWAY\n',
      },
      {
        path: 'OTHER.md',
        contents:
          '# HELLO WORLD! \nTHINGS GO HERE\nALSO FEATURE BRANCH UNDERWAY\n',
      },
    ],
  }

  await makeCommit(repository, featureBranchCommit)

  // put the repository back on the default branch

  await switchTo(repository, 'master')

  return repository
}
