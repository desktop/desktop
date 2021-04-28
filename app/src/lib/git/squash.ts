import * as FSE from 'fs-extra'
import { getCommits, revRange } from '.'
import { Commit, CommitOneLine } from '../../models/commit'
import { Repository } from '../../models/repository'
import { getTempFilePath } from '../file-system'
import { rebaseInteractive, RebaseResult } from './rebase'

/**
 * Squashes provided commits by calling interactive rebase
 *
 * @param toSquash - commits to squash onto another commit
 * @param squashOnto  - commit to squash the `squash` commits onto
 * @param previousCommit -  sha of commit before all commits in squash operation
 * @param commitSummary - summary of new commit made by squash
 * @param commitDescription - description of new commit made by squash
 * @returns - true if successful, false if failed
 */
export async function squash(
  repository: Repository,
  toSquash: ReadonlyArray<CommitOneLine>,
  squashOnto: CommitOneLine,
  lastRetainedCommitRef: string,
  commitSummary: string,
  commitDescription: string
): Promise<RebaseResult> {
  const commits: Commit[] = [
    ...(await getCommits(repository, revRange(lastRetainedCommitRef, 'HEAD'))),
  ]

  let todoOutput = ''
  commits.forEach(c => {
    if (toSquash.map(sq => sq.sha).includes(c.sha)) {
      return
    }

    if (c.sha === squashOnto.sha) {
      todoOutput += `pick ${c.sha} ${c.summary}\n`
      toSquash.forEach(async sq => {
        todoOutput += `squash ${sq.sha} ${sq.summary}\n`
      })
      return
    }

    todoOutput += `pick ${c.sha} ${c.summary}\n`
  })

  const todoPath = await getTempFilePath('squashTodo')
  await FSE.writeFile(todoPath, todoOutput)

  const messagePath = await getTempFilePath('squashCommitMessage')
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

  FSE.remove(todoPath)
  FSE.remove(messagePath)

  return result
}
