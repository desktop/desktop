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
 * @param lastRetainedCommitRef - sha of commit before commits in squash
 * @param commitMessage - the first line of the string provided will be the
 * summary and rest the body (similar to commit implementation)
 */
export async function squash(
  repository: Repository,
  toSquash: ReadonlyArray<CommitOneLine>,
  squashOnto: CommitOneLine,
  lastRetainedCommitRef: string,
  commitMessage: string
): Promise<RebaseResult> {
  let messagePath, todoPath
  let result: RebaseResult

  try {
    if (toSquash.length === 0) {
      throw new Error('[squash] No commits provided to squash.')
    }

    const commits = await getCommits(
      repository,
      revRange(lastRetainedCommitRef, 'HEAD')
    )

    if (commits.length === 0) {
      throw new Error(
        '[squash] Could not find commits in log for last retained commit ref.'
      )
    }

    todoPath = await getTempFilePath('squashTodo')
    let foundSquashOntoCommitInLog = false
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
        foundSquashOntoCommitInLog = true
        for (let j = 0; j < toSquash.length; j++) {
          await FSE.appendFile(
            todoPath,
            `squash ${toSquash[j].sha} ${toSquash[j].summary}\n`
          )
        }
      }
    }

    if (!foundSquashOntoCommitInLog) {
      throw new Error(
        '[squash] The commit to squash onto was not in the log. Continuing would result in dropping the commits in the toSquash array.'
      )
    }

    if (commitMessage.trim() !== '') {
      messagePath = await getTempFilePath('squashCommitMessage')
      await FSE.writeFile(messagePath, commitMessage)
    }

    // if no commit message provided, accept default editor
    const gitEditor =
      messagePath !== undefined ? `cat "${messagePath}" >` : undefined

    result = await rebaseInteractive(
      repository,
      todoPath,
      lastRetainedCommitRef,
      'squash',
      gitEditor
      // TODO: add progress
    )
  } catch (e) {
    log.error(e)
    return RebaseResult.Error
  } finally {
    if (todoPath !== undefined) {
      FSE.remove(todoPath)
    }

    if (messagePath !== undefined) {
      FSE.remove(messagePath)
    }
  }

  return result
}
