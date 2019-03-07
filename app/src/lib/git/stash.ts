import { git } from '.'
import { Repository } from '../../models/repository'

export interface IStashEntry {
  /** The name of the branch at the time the entry was created. */
  readonly branchName: string

  /** The SHA of the commit object created as a result of stashing. */
  readonly stashSha: string
}

/** RegEx for parsing out the stash SHA and message */
const stashEntryRe = /^([0-9a-f]{5,40})@(.+)$/

export async function getStashEntries(
  repository: Repository
): Promise<ReadonlyArray<IStashEntry>> {
  const prettyFormat = '%H@%gs'
  const result = await git(
    ['log', '-g', 'refs/stash', `--pretty=${prettyFormat}`],
    repository.path,
    'getStashEntries'
  )

  const out = result.stdout
  const lines = out.split('\n')

  const stashEntries: Array<IStashEntry> = []
  for (const line of lines) {
    const match = stashEntryRe.exec(line)

    console.log(match)
    if (match == null) {
      continue
    }

    stashEntries.push({
      branchName: 'Todo: parse from message',
      stashSha: match[1],
    })
  }

  return stashEntries
}
