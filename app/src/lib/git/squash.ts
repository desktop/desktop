import * as FSE from 'fs-extra'
import { getCommits, revRange } from '.'
import { CommitOneLine } from '../../models/commit'
import { Repository } from '../../models/repository'
import { getTempFilePath } from '../file-system'
import { rebaseInteractive, RebaseResult } from './rebase'

/**
 * Squashes provided commits by calling interactive rebase
 *
 * @param toSquash - commits to squash onto another commit
 * @param squashOnto  - commit to squash the `toSquash` commits onto
 * @param lastRetainedCommitRef -  sha of commit before all commits in squash operation
 * @param commitSummary - summary of new commit made by squash
 * @param commitDescription - description of new commit made by squash
 */
export async function squash(
  repository: Repository,
  toSquash: ReadonlyArray<CommitOneLine>,
  squashOnto: CommitOneLine,
  lastRetainedCommitRef: string,
  commitSummary: string,
  commitDescription: string
): Promise<RebaseResult> {
  let messagePath, todoPath

  try {
    const commits = await getCommits(
      repository,
      revRange(lastRetainedCommitRef, 'HEAD')
    )

    todoPath = await getTempFilePath('squashTodo')

    // need to traverse in reverse so we do oldest to newest (replay commits)
    for (let i = commits.length - 1; i >= 0; i--) {
      // Ignore commits to squash because those are written right next to the target commit
      if (toSquash.map(sq => sq.sha).includes(commits[i].sha)) {
        continue
      }

      await FSE.appendFile(
        todoPath,
        `pick ${commits[i].sha} ${commits[i].summary}\n`
      )

      // If it's the target commit, write a `squash` line for every commit to squash
      if (commits[i].sha === squashOnto.sha) {
        for (let j = 0; j < toSquash.length; j++) {
          await FSE.appendFile(
            todoPath,
            `squash ${toSquash[j].sha} ${toSquash[j].summary}\n`
          )
        }
      }
    }

    messagePath = await getTempFilePath('squashCommitMessage')
    const message =
      commitDescription !== ''
        ? `${commitSummary}\n\n${commitDescription}`
        : commitSummary
    await FSE.writeFile(messagePath, message)

    const result = await rebaseInteractive(
      repository,
      todoPath,
      lastRetainedCommitRef,
      'squash',
      `cat "${messagePath}" >`
      // TODO: add progress
    )
    return result
  } catch (e) {
    if (todoPath !== undefined) {
      FSE.remove(todoPath)
    }

    if (messagePath !== undefined) {
      FSE.remove(messagePath)
    }
  }

  return RebaseResult.Error
}
