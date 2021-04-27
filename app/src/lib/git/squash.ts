import * as Path from 'path'
import * as FSE from 'fs-extra'
import { getCommits, git, IGitExecutionOptions } from '.'
import { CommitOneLine } from '../../models/commit'
import { Repository } from '../../models/repository'

/**
 * Initiates an interactive rebase and squashes provided commits
 *
 * @param squash - commits to squash onto another commit
 * @param squashOnto  - commit to squash the `squash` commits onto
 * @param previousCommit -  sha of commit before all commits in squash operation
 * @param commitSummary - summary of new commit made by squash
 * @param commitDescription - description of new commit made by squash
 * @returns - true if successful, false if failed
 */
export async function squash(
  repository: Repository,
  squash: ReadonlyArray<CommitOneLine>,
  squashOnto: CommitOneLine,
  logIndex: number,
  commitSummary: string,
  commitDescription: string
): Promise<ReadonlyArray<string>> {
  const options: IGitExecutionOptions = {
    env: {
      // if we don't provide editor, we can't detect git errors
      // GIT_EDITOR: ':',
    },
  }

  // get commits from log to cherry pick
  /*
  const commits = await getCommits(
    repository,
    'HEAD~' + logIndex + 1,
    logIndex + 1
  )
  */

  //return commits.map(c => c.shortSha)

  // current branch name
  //  const currentBranch = git current branch...

  // Create a temporary branch from the head before the earliest squash commit
  // - const tempBranch = git checkout head~x -b temp branch... pick a branch name that doesn't exist..

  // loop through log
  //  if commit === SquashOnto
  //    - cherry pick -n squash onto
  //    - loop through ToSquash -> cherry pick -n (may have conflicts/Progress?)
  //    - commit -m commitsummary and commitDescription
  //  if commit in squashOnto
  //    - continue loop
  //  else
  //    - cherry pick regular
  // This loop process could be aborted at anytime.. if so delete temp branch, check out current branch

  // check out current branch
  // git hard reset --> HEAD~logIndex+1
  // git rebase tempBranch ... this should not have conflicts since the branches base history should be the same..

  // Start interactive rebase
  await git(
    [
      'rebase',
      '-c',
      '"sequence.editor=sed -i /123456/d"',
      '-i',
      'HEAD~'logIndex+1,
    ],
    repository.path,
    'squash',
    options
  )

  return []

  // parse todo

  // build new todo

  // save todo

  //return true
}
