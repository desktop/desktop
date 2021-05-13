import * as FSE from 'fs-extra'
import { getCommits, revRange } from '.'
import { CommitOneLine } from '../../models/commit'
import { Repository } from '../../models/repository'
import { getTempFilePath } from '../file-system'
import { rebaseInteractive, RebaseResult } from './rebase'

/**
 * Squashes provided commits by calling interactive rebase.
 *
 * Goal is to replay the commits in order from oldest to newest to reduce
 * conflicts with toSquash commits placed in the log at the location of the
 * squashOnto commit.
 *
 * Example: A user's history from oldest to newest is A, B, C, D, E and they
 * want to squash A and E (toSquash) onto C. Our goal:  B, A-C-E, D. Thus,
 * maintaining that A came before C and E came after C, placed in history at the
 * the squashOnto of C.
 *
 * Also means if the last 2 commits in history are A, B, whether user squashes A
 * onto B or B onto A. It will always perform based on log history, thus, B onto
 * A.
 *
 * @param toSquash - commits to squash onto another commit and does not contain the squashOnto commit
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

    const toSquashShas = new Set(toSquash.map(c => c.sha))
    if (toSquashShas.has(squashOnto.sha)) {
      throw new Error(
        '[squash] The commits to squash cannot contain the commit to squash onto.'
      )
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
    const toReplayAtSquash = []
    const toReplayAfterSquash = []
    // Traversed in reverse so we do oldest to newest (replay commits)
    for (let i = commits.length - 1; i >= 0; i--) {
      const commit = commits[i]
      if (toSquashShas.has(commit.sha)) {
        // If it is toSquash commit and we have found the squashOnto commit, we
        // can go ahead and squash them (as we will hold any picks till after)
        if (foundSquashOntoCommitInLog) {
          await FSE.appendFile(
            todoPath,
            `squash ${commit.sha} ${commit.summary}\n`
          )
        } else {
          // However, if we have not found the squashOnto commit yet we want to
          // keep track of them in the order of the log. Thus, we use a new
          // `toReplayAtSquash` array and not trust that what was sent is in the
          // order of the log.
          toReplayAtSquash.push(commit)
        }

        continue
      }

      // If it's the squashOnto commit, replay to the toSquash in the order they
      // appeared on the log to reduce potential conflicts.
      if (commit.sha === squashOnto.sha) {
        foundSquashOntoCommitInLog = true
        toReplayAtSquash.push(commit)

        for (let j = 0; j < toReplayAtSquash.length; j++) {
          const action = j === 0 ? 'pick' : 'squash'
          await FSE.appendFile(
            todoPath,
            `${action} ${toReplayAtSquash[j].sha} ${toReplayAtSquash[j].summary}\n`
          )
        }

        continue
      }

      // We can't just replay a pick in case there is a commit from the toSquash
      // commits further up in history that need to be replayed with the
      // squashes. Thus, we will keep track of these and replay after traversing
      // the remainder of the log.
      if (foundSquashOntoCommitInLog) {
        toReplayAfterSquash.push(commit)
        continue
      }

      // If it is not one toSquash nor the squashOnto and have not found the
      // squashOnto commit, we simply record it is an unchanged pick (before the
      // squash)
      await FSE.appendFile(todoPath, `pick ${commit.sha} ${commit.summary}\n`)
    }

    if (toReplayAfterSquash.length > 0) {
      for (let i = 0; i < toReplayAfterSquash.length; i++) {
        await FSE.appendFile(
          todoPath,
          `pick ${toReplayAfterSquash[i].sha} ${toReplayAfterSquash[i].summary}\n`
        )
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
