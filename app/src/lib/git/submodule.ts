import { git } from './core'
import { Repository } from '../../models/repository'
import { SubmoduleEntry } from '../../models/submodule'

export async function listSubmodules(
  repository: Repository
): Promise<ReadonlyArray<SubmoduleEntry>> {
  const result = await git(
    ['submodule', 'status', '--'],
    repository.path,
    'listSubmodules'
  )

  const entries = result.stdout
    .split('\n')
    .map(x => x.trim())
    .filter(x => x.length > 0)
    .map(x => x.split(/\s+/))

  const submodules = new Array<SubmoduleEntry>()

  for (const entry of entries) {
    // entries are of the format
    const sha = entry[0].substr(1)
    const path = entry[1]

    // TODO: what if there's no tag here?
    const tagInBraces = entry[2]
    const nearestTag = entry[2].substr(1, tagInBraces.length - 2)
    submodules.push(new SubmoduleEntry(sha, path, nearestTag))
  }

  return submodules
}
