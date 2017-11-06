import { git } from './core'
import { Repository } from '../../models/repository'

/**
 * Possible statuses of an entry in Git, see the git diff-index
 * man page for additional details.
 */
export enum IndexStatus {
  Unknown = 0,
  Added,
  Copied,
  Deleted,
  Modified,
  Renamed,
  TypeChanged,
  Unmerged,
}

/**
 * Index statuses excluding renames and copies.
 *
 * Used when invoking diff-index with rename detection explicitly turned
 * off.
 */
export type NoRenameIndexStatus =
  | IndexStatus.Added
  | IndexStatus.Deleted
  | IndexStatus.Modified
  | IndexStatus.TypeChanged
  | IndexStatus.Unmerged
  | IndexStatus.Unknown

function getIndexStatus(status: string) {
  switch (status[0]) {
    case 'A':
      return IndexStatus.Added
    case 'C':
      return IndexStatus.Copied
    case 'D':
      return IndexStatus.Deleted
    case 'M':
      return IndexStatus.Modified
    case 'R':
      return IndexStatus.Renamed
    case 'T':
      return IndexStatus.TypeChanged
    case 'U':
      return IndexStatus.Unmerged
    case 'X':
      return IndexStatus.Unknown
    default:
      throw new Error(`Unknown index status: ${status}`)
  }
}

function getNoRenameIndexStatus(status: string): NoRenameIndexStatus {
  const parsed = getIndexStatus(status)

  switch (parsed) {
    case IndexStatus.Copied:
    case IndexStatus.Renamed:
      throw new Error(
        `Invalid index status for no-rename index status: ${parsed}`
      )
  }

  return parsed
}

/** The SHA for the null tree. */
const NullTreeSHA = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'

/**
 * Get a list of files which have recorded changes in the index as compared to
 * HEAD along with the type of change.
 *
 * @param repository The repository for which to retrieve the index changes.
 */
export async function getIndexChanges(
  repository: Repository
): Promise<Map<string, NoRenameIndexStatus>> {
  const args = ['diff-index', '--cached', '--name-status', '--no-renames', '-z']

  let result = await git(
    [...args, 'HEAD', '--'],
    repository.path,
    'getIndexChanges',
    {
      successExitCodes: new Set([0, 128]),
    }
  )

  // 128 from diff-index either means that the path isn't a repository or (more
  // likely) that the repository HEAD is unborn. If HEAD is unborn we'll diff
  // the index against the null tree instead.
  if (result.exitCode === 128) {
    result = await git(
      [...args, NullTreeSHA],
      repository.path,
      'getIndexChanges'
    )
  }

  const map = new Map<string, NoRenameIndexStatus>()

  const pieces = result.stdout.split('\0')

  for (let i = 0; i < pieces.length - 1; i += 2) {
    const status = getNoRenameIndexStatus(pieces[i])
    const path = pieces[i + 1]

    map.set(path, status)
  }

  return map
}
