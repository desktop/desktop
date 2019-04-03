import { Repository } from '../../src/models/repository'
import { setupEmptyRepository } from './repositories'
import { makeCommit, switchTo, createBranch } from './repository-scaffolding'

/**
 * Creates a test repository to be used as the branch for testing rebase
 * behaviour with:
 *  - two commits on `master`,
 *  - three commit on `firstBranchName`, which is based on `master`
 *  - ten commits on `secondBranchName`, which is also based on `master`
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

  const firstBaseBranchCommit = {
    commitMessage: 'Base Branch First Commit!',
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
  await makeCommit(repository, firstBaseBranchCommit)

  const secondBaseBranchCommit = {
    commitMessage: 'Base Branch Second Commit!',
    entries: [
      {
        path: 'THING.md',
        contents: '# HELLO WORLD! \nTHINGS GO HERE\nMAKING BRANCH CHANGES\n',
      },
      {
        path: 'OTHER.md',
        contents:
          '# HELLO WORLD! \nTHINGS GO HERE\nMORE BASE BRANCH CHANGES HAPPENING\n',
      },
    ],
  }
  await makeCommit(repository, secondBaseBranchCommit)

  const thirdBaseBranchCommit = {
    commitMessage: 'Base Branch Third Commit!',
    entries: [
      {
        path: 'THING.md',
        contents: '# HELLO WORLD! \nWORDS IN HERE\nMAKING BRANCH CHANGES\n',
      },
      {
        path: 'OTHER.md',
        contents:
          '# HELLO WORLD! \nALSO WORDS GO IN HERE\nMORE BASE BRANCH CHANGES HAPPENING\n',
      },
    ],
  }
  await makeCommit(repository, thirdBaseBranchCommit)

  await switchTo(repository, secondBranchName)

  const firstFeatureBranchCommit = {
    commitMessage: 'Feature Branch First Commit!',
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
  await makeCommit(repository, firstFeatureBranchCommit)

  const secondFeatureBranchCommit = {
    commitMessage: 'Feature Branch Second Commit!',
    entries: [
      {
        path: 'THING.md',
        contents:
          '# HELLO WORLD! \nTHINGS GO HERE\nALSO FEATURE BRANCH CHANGES\n',
      },
      {
        path: 'OTHER.md',
        contents:
          '# HELLO WORLD! \nTHINGS GO HERE\nYES FEATURE BRANCH HERE TOO\n',
      },
    ],
  }
  await makeCommit(repository, secondFeatureBranchCommit)

  const thirdFeatureBranchCommit = {
    commitMessage: 'Feature Branch Third Commit!',
    entries: [
      {
        path: 'THING.md',
        contents:
          '# HELLO WORLD! \nCHAAAAANGE HERE\nALSO FEATURE BRANCH CHANGES\n',
      },
      {
        path: 'OTHER.md',
        contents:
          '# HELLO WORLD! \nCHAAAAANGE GO HERE\nYES FEATURE BRANCH HERE TOO\n',
      },
    ],
  }
  await makeCommit(repository, thirdFeatureBranchCommit)

  const fourthFeatureBranchCommit = {
    commitMessage: 'Feature Branch Fourth Commit!',
    entries: [
      {
        path: 'THING.md',
        contents:
          '# HELLO WORLD! \nCHANGES GO HERE\nALSO FEATURE BRANCH CHANGES\n',
      },
      {
        path: 'OTHER.md',
        contents:
          '# HELLO WORLD! \nCHANGE ALSO GO HERE TOO\nYES FEATURE BRANCH HERE TOO\n',
      },
    ],
  }
  await makeCommit(repository, fourthFeatureBranchCommit)

  const fifthFeatureBranchCommit = {
    commitMessage: 'Feature Branch Fifth Commit!',
    entries: [
      {
        path: 'THING.md',
        contents:
          '# SO LONG AND THANKS FOR THE FISH! \nTHINGS GO HERE\nALSO FEATURE BRANCH CHANGES\n',
      },
      {
        path: 'OTHER.md',
        contents:
          '# IS IT FRIDAY YET? \nTHINGS GO HERE\nYES FEATURE BRANCH HERE TOO\n',
      },
    ],
  }
  await makeCommit(repository, fifthFeatureBranchCommit)

  const sixthFeatureBranchCommit = {
    commitMessage: 'Feature Branch Sixth Commit!',
    entries: [
      {
        path: 'THING.md',
        contents:
          '# HELLO WORLD! \nWORDS WORDS WORDS\nALSO FEATURE BRANCH CHANGES\n',
      },
      {
        path: 'OTHER.md',
        contents:
          '# HELLO WORLD! WORDS WORDS WORDS\nYES FEATURE BRANCH HERE TOO\n',
      },
    ],
  }
  await makeCommit(repository, sixthFeatureBranchCommit)

  const seventhFeatureBranchCommit = {
    commitMessage: 'Feature Branch Third Commit!',
    entries: [
      {
        path: 'THING.md',
        contents: '# HELLO WORLD! \nTHINGS GO HERE\nWORDS WORDS WORDS\n',
      },
      {
        path: 'OTHER.md',
        contents: '# HELLO WORLD! \nTHINGS GO HERE\nWORDS WORDS WORDS\n',
      },
    ],
  }
  await makeCommit(repository, seventhFeatureBranchCommit)

  const eighthFeatureBranchCommit = {
    commitMessage: 'Feature Branch Eighth Commit!',
    entries: [
      {
        path: 'THING.md',
        contents:
          '# WORDS WORDS WORDS! \nTHINGS GO HERE\nALSO FEATURE BRANCH CHANGES\n',
      },
      {
        path: 'OTHER.md',
        contents:
          '# WORDS WORDS WORDS! \nTHINGS GO HERE\nYES FEATURE BRANCH HERE TOO\n',
      },
    ],
  }
  await makeCommit(repository, eighthFeatureBranchCommit)

  const ninthFeatureBranchCommit = {
    commitMessage: 'Feature Branch Ninth Commit!',
    entries: [
      {
        path: 'THING.md',
        contents: '# HELLO WORLD! \nTHINGS GO HERE\nARE WE THERE YET?\n',
      },
      {
        path: 'OTHER.md',
        contents: '# HELLO WORLD! \nTHINGS GO HERE\nARE WE THERE YET?\n',
      },
    ],
  }
  await makeCommit(repository, ninthFeatureBranchCommit)

  const tenthFeatureBranchCommit = {
    commitMessage: 'Feature Branch Tenth Commit!',
    entries: [
      {
        path: 'THING.md',
        contents:
          '# HELLO WORLD! \nDOOT DOOT DOOT\nALSO FEATURE BRANCH CHANGES\n',
      },
      {
        path: 'OTHER.md',
        contents:
          '# DOOT DOOT DOOT! \nTHINGS GO HERE\nYES FEATURE BRANCH HERE TOO\n',
      },
    ],
  }
  await makeCommit(repository, tenthFeatureBranchCommit)

  // put the repository back on the default branch

  await switchTo(repository, 'master')

  return repository
}
