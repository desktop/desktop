import { Repository } from '../../src/models/repository'
import { setupEmptyRepository } from './repositories'
import { makeCommit, switchTo, createBranch } from './repository-scaffolding'

/**
 * Creates a test repository to be used as the branch for testing rebase
 * behaviour with:
 *  - two commits on default branch,
 *  - one commit on `featureBranchName`, which has a commit on in addition to default to cherry pick
 *  - one commit on `targetBranchName`, which is also based on default branch
 */
export async function createRepository(
  featureBranchName: string,
  targetBranchName: string
): Promise<Repository> {
  const repository = await setupEmptyRepository()

  // make two commits on default to setup the README

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

  await createBranch(repository, featureBranchName, 'HEAD')
  await createBranch(repository, targetBranchName, 'HEAD')

  await switchTo(repository, featureBranchName)

  // add a commit to cherry pick
  const featureBranchCommit = {
    commitMessage: 'Cherry Picked Feature!',
    entries: [
      {
        path: 'THING.md',
        contents: '# HELLO WORLD! \nTHINGS GO HERE\n',
      },
    ],
  }

  await makeCommit(repository, featureBranchCommit)

  // switch to the target branch
  await switchTo(repository, targetBranchName)

  return repository
}
