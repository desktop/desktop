import { git } from '.'
import { Repository } from '../../models/repository'

export const MagicStashString = '!github-desktop'
export interface IStashEntry {
  /** The name of the branch at the time the entry was created. */
  readonly branchName: string

  /** The SHA of the commit object created as a result of stashing. */
  readonly stashSha: string
}

/** RegEx for parsing out the stash SHA and message */
const stashEntryRe = /^([0-9a-f]{5,40})@(.+)$/

/**
 * Get the list of stash entries
 *
 * @param repository
 */
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

    if (match == null) {
      continue
    }

    const branchName = getCanonicalRefName(match[2])

    // if branch name is null, the stash entry isn't using our magic string
    if (branchName === null) {
      continue
    }

    stashEntries.push({
      branchName: branchName,
      stashSha: match[1],
    })
  }

  return stashEntries
}

function getCanonicalRefName(stashMessage: string): string | null {
  const parts = stashMessage.split(':').map(s => s.trim())
  const magicString = parts[1]
  const canonicalRef = parts[2]

  if (magicString !== MagicStashString) {
    return null
  }

  return canonicalRef
}
