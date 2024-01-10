import { Repository } from '../../src/models/repository'
import { setupEmptyRepositoryDefaultMain } from './repositories'
import { makeCommit, switchTo, createBranch } from './repository-scaffolding'

/**
 * Creates a test repository to be used for testing cherry pick behaviour with:
 *  - one commit on default branch,
 *  - one commit on `featureBranchName` to cherry pick
 *  - creates `targetBranchName` off of default branch
 */
export async function createRepository(
  featureBranchName: string,
  targetBranchName: string
): Promise<Repository> {
  const repository = await setupEmptyRepositoryDefaultMain()

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
  const featureBranchCommit = {
    commitMessage: 'Cherry-picked Feature!',
    entries: [
      {
        path: 'THING.md',
        contents: '# HELLO WORLD! \nTHINGS GO HERE\n',
      },
    ],
  }
  await makeCommit(repository, featureBranchCommit)

  await switchTo(repository, targetBranchName)
  return repository
}
