import { Repository } from '../../src/models/repository'
import { setupEmptyRepository } from './repositories'
import { makeCommit, switchTo } from './repository-scaffolding'

/**
 * Creates a test repository with two commits on `master`, and then
 * two commits on `branchName` to be used as the branch for testing pull
 * behaviour
 *
 * @param branchName name to use for new branch
 */
export async function createRepository(
  branchName: string
): Promise<Repository> {
  const repository = await setupEmptyRepository()

  // make two commits on `master` to setup the README

  const firstCommit = {
    commitMessage: 'First!',
    entries: [
      {
        path: 'README.md',
        value: Buffer.from('# HELLO WORLD! \n'),
      },
    ],
  }

  await makeCommit(repository, firstCommit)

  const secondCommit = {
    commitMessage: 'Second!',
    entries: [
      {
        path: 'THING.md',
        value: Buffer.from('# HELLO WORLD! \nTHINGS GO HERE\n'),
      },
      {
        path: 'OTHER.md',
        value: Buffer.from('# HELLO WORLD! \nTHINGS GO HERE\n'),
      },
    ],
  }

  await makeCommit(repository, secondCommit)

  await switchTo(repository, branchName)

  const firstCommitToBranch = {
    commitMessage: 'Added a new file',
    entries: [
      {
        path: 'CONTRIBUTING.md',
        value: Buffer.from(''),
      },
    ],
  }

  await makeCommit(repository, firstCommitToBranch)

  const secondCommitToBranch = {
    commitMessage: 'Updated README',
    entries: [
      {
        path: 'README.md',
        value: Buffer.from('things go here'),
      },
    ],
  }

  await makeCommit(repository, secondCommitToBranch)

  return repository
}
