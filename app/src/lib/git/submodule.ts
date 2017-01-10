import { git } from './core'
import { Repository } from '../../models/repository'
import { FileStatus, FileChange, WorkingDirectoryFileChange } from '../../models/status'
import { mapStatus } from './status'

// TODO: docs

export class SubmoduleChange {

  public readonly path: string

  public readonly from?: string

  public readonly to?: string

  public readonly type: FileStatus
}

const zeroSha = '0000000000000000000000000000000000000000'
const submoduleMode = '160000'

// NOTE:
// as of Git 2.11, abbreviated SHAs may be more than 7 characters
// we probably need to revisit some places where we do this trimming
// ourselves - e.g. `commit-summary.tsx`
function formatSha(text: string): string {
  return text.slice(0, 7)
}

/**
 * Map the found identifier to a object id in the Git database
 *
 * @returns the 40-character OID if the object exists, or undefined if the
 * found input is '0000000000000000000000000000000000000000' which
 * represents a non-existent object.
 */
function getIdentifier(input: string): string | undefined {
  if (input === zeroSha) {
    return undefined
  }
  return formatSha(input)
}

const submoduleEntryRegex = /Submodule .* ([a-z0-9]{7,40})..([a-z0-9]{7,40})\:/

async function getSubmoduleChangeWorkingDirectory(repository: Repository, file: FileChange): Promise<Array<SubmoduleChange>> {

  const result = await git([ 'diff', '--submodule', '-z', '--', file.path ], repository.path, 'getDiffTree')

  const array: Array<SubmoduleChange> = [ ]

  const match = submoduleEntryRegex.exec(result.stdout)
  if (match) {
    const path = file.path
    const type = file.status
    const from = match[1]
    const to = match[2]
    array.push({ path, from, to, type })
  }

  return array
}

async function getSubmoduleListHistory(repository: Repository, file: FileChange, committish: string): Promise<Array<SubmoduleChange>> {

  const range =`${committish}~1..${committish}`
  // TODO: control formatting betterer here?
  const result = await git([ 'diff-tree', '--raw', '-z', range, '--', file.path ], repository.path, 'getDiffTree')

  // the expected format here is a row like this:
  // :000000 160000 0000000000000000000000000000000000000000 f1a74d299b28b4278d6127fbb3e9cc7aeedc153f A	friendly-bassoon
  //
  // split on the found colon character
  // TODO: maybe this can be more robust, for situations where : is in the file path
  const lines = result.stdout.split(':')

  const array: Array<SubmoduleChange> = [ ]

  // index 0 is the empty string before the first semi-colon, skip it
  for (let i = 1; i < lines.length; i++) {

    const tokens = lines[i].split('\0')
    const inputs = tokens[0].split(' ')
    const path = tokens[1]

    // the first two values are the mode for the change
    // if either of these values is 160000, we have a submodule change
    if (inputs[0] === submoduleMode || inputs[1] === submoduleMode) {
      const from = getIdentifier(inputs[2])
      const to = getIdentifier(inputs[3])
      const type = mapStatus(inputs[4])
      array.push({ path, from, to, type })
    }
  }

  return array
}

/**
 * Retrieve the submodule list for the current repository.
 *
 * For historical commits, use `git diff-tree` as this works independent of the
 * .gitmodules state.
 *
 * For working directory changes, use `git submodule summary` as the .gitmodules
 * state can be relied on for tracking changes.
 */
export async function getSubmoduleList(repository: Repository, file: FileChange, committish: string): Promise<Array<SubmoduleChange>> {
  if (file instanceof WorkingDirectoryFileChange) {
    return getSubmoduleChangeWorkingDirectory(repository, file)
  } else {
    return getSubmoduleListHistory(repository, file, committish)
  }
}