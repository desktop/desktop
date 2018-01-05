import { git } from './core'
import { Repository } from '../../models/repository'
import { SubmoduleEntry } from '../../models/submodule'

export async function listSubmodules(
  repository: Repository
): Promise<ReadonlyArray<SubmoduleEntry>> {
  // We don't recurse when listing submodules here because we don't have a good
  // story about managing these currently. So for now we're only listing
  // changes to the top-level submodules to be consistent with `git status`
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
    // entries are of the format:
    //  1eaabe34fc6f486367a176207420378f587d3b48 git (v2.16.0-rc0)
    //
    // first character:
    //   - " " if no change
    //   - "-" if the submodule is not initialized
    //   - "+" if the currently checked out submodule commit does not match the SHA-1 found in the index of the containing repository
    //   - "U" if the submodule has merge conflicts
    //
    // then the 40-character SHA represents the current commit
    //
    // then the path to the submodule
    //
    // then the output of `git describe` for the submodule in braces:
    //   - (tag) if the current commit is associated with a tag
    //   - ({tag}-{count}-{short-sha}) if the current commit does not have a tag
    //     {count} is the number of commits ahead of the tag
    //     {shortsha} is the abbreviated SHA of the current commit
    //
    // TODO: what if there are no tags in the submodule?
    const sha = entry[0].substr(1)
    const path = entry[1]

    const tagInBraces = entry[2]
    const nearestTag = entry[2].substr(1, tagInBraces.length - 2)
    submodules.push(new SubmoduleEntry(sha, path, nearestTag))
  }

  return submodules
}

export async function resetSubmodulePaths(
  repository: Repository,
  paths: ReadonlyArray<string>
): Promise<void> {
  for (const path of paths) {
    await git(
      ['submodule', 'update', '--recursive', '--', path],
      repository.path,
      'updateSubmodule'
    )
  }
}
