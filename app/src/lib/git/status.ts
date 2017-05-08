import { git } from './core'
import {
  WorkingDirectoryStatus,
  WorkingDirectoryFileChange,
  AppFileStatus,
  FileStatus,
  GitFileStatus,
} from '../../models/status'
import { parsePorcelainStatus } from '../status-parser'
import { DiffSelectionType, DiffSelection } from '../../models/diff'
import { Repository } from '../../models/repository'
import { IAheadBehind } from './rev-list'
import { fatalError } from '../../lib/fatal-error'

/** The encapsulation of the result from 'git status' */
export interface IStatusResult {
  readonly currentBranch?: string
  readonly currentUpstreamBranch?: string
  readonly currentTip?: string
  readonly branchAheadBehind?: IAheadBehind

  /** true if the repository exists at the given location */
  readonly exists: boolean

  /** the absolute path to the repository's working directory */
  readonly workingDirectory: WorkingDirectoryStatus
}

function convertToAppStatus(status: string): AppFileStatus {
  switch (status) {
    case 'new': return AppFileStatus.New
    case 'modified': return AppFileStatus.Modified
    case 'deleted': return AppFileStatus.Deleted
    case 'renamed': return AppFileStatus.Renamed
    case 'copied': return AppFileStatus.Copied
    case 'conflicted': return AppFileStatus.Conflicted
  }

  return fatalError(`Unknown file status ${status}`)
}

/**
 * Map the raw status text from Git to a structure we can work with in the app.
 *
 * This relies on the porcelain v2 format and status codes, so for
 * interoperability the existing v1 code is still around for now.
 */
function mapStatus(status: string): FileStatus {
  if (status === '??') {
    return {
      kind: 'new',
      staged: GitFileStatus.Untracked,
      unstaged: GitFileStatus.Untracked,
    }
  }

  if (status === '.M') {
    return {
      kind: 'modified',
      staged: GitFileStatus.Unchanged,
      unstaged: GitFileStatus.Modified,
    }
  }

  if (status === 'M.') {
    return {
      kind: 'modified',
      staged: GitFileStatus.Modified,
      unstaged: GitFileStatus.Unchanged,
    }
  }

  if (status === '.A') {
    return {
      kind: 'new',
      staged: GitFileStatus.Unchanged,
      unstaged: GitFileStatus.Added,
    }
  }

  if (status === 'A.') {
    return {
      kind: 'new',
      staged: GitFileStatus.Added,
      unstaged: GitFileStatus.Unchanged,
    }
  }

  if (status === '.D') {
    return {
      kind: 'deleted',
      staged: GitFileStatus.Unchanged,
      unstaged: GitFileStatus.Deleted,
    }
  }

  if (status === 'D.') {
    return {
      kind: 'deleted',
      staged: GitFileStatus.Deleted,
      unstaged: GitFileStatus.Unchanged,
    }
  }

  if (status === 'R.') {
    return {
      kind: 'renamed',
      staged: GitFileStatus.Renamed,
      unstaged: GitFileStatus.Unchanged,
    }
  }

  if (status === '.R') {
    return {
      kind: 'renamed',
      staged: GitFileStatus.Unchanged,
      unstaged: GitFileStatus.Renamed,
    }
  }

  if (status === 'C.') {
    return {
      kind: 'copied',
      staged: GitFileStatus.Renamed,
      unstaged: GitFileStatus.Unchanged,
    }
  }

  if (status === '.C') {
    return {
      kind: 'copied',
      staged: GitFileStatus.Unchanged,
      unstaged: GitFileStatus.Renamed,
    }
  }

  if (status === 'AM') {
    return {
      kind: 'new',
      staged: GitFileStatus.Added,
      unstaged: GitFileStatus.Modified,
    }
  }

  if (status === 'RM') {
    return {
      kind: 'renamed',
      staged: GitFileStatus.Renamed,
      unstaged: GitFileStatus.Modified,
    }
  }

  if (status === 'RD') {
    // renamed in index, deleted in working directory
    // TODO: review this and see whether "Conflicted" is still the right code
    //       because it doesn't align with the T Y P E S created before this
    return {
      kind: 'renamed',
      staged: GitFileStatus.Renamed,
      unstaged: GitFileStatus.Deleted,
    }
  }

  if (status === 'DD') {
    return {
      kind: 'conflicted',
      us: GitFileStatus.Deleted,
      them: GitFileStatus.Deleted,
    }
  }

  if (status === 'AU') {
    return {
      kind: 'conflicted',
      us: GitFileStatus.Added,
      them: GitFileStatus.Modified,
    }
  }

  if (status === 'UD') {
    return {
      kind: 'conflicted',
      us: GitFileStatus.Modified,
      them: GitFileStatus.Deleted,
    }
  }

  if (status === 'UA') {
    return {
      kind: 'conflicted',
      us: GitFileStatus.Modified,
      them: GitFileStatus.Added,
    }
  }

  if (status === 'DU') {
    return {
      kind: 'conflicted',
      us: GitFileStatus.Deleted,
      them: GitFileStatus.Modified,
    }
  }

  if (status === 'AA') {
    return {
      kind: 'conflicted',
      us: GitFileStatus.Added,
      them: GitFileStatus.Added,
    }
  }

    if (status === 'UU') {
    return {
      kind: 'conflicted',
      us: GitFileStatus.Modified,
      them: GitFileStatus.Modified,
    }
  }

  // git log -M --name-status will return a RXXX - where XXX is a percentage
  if (status.match(/R[0-9]+/)) { return { kind: 'renamed' } }

  // git log -C --name-status will return a CXXX - where XXX is a percentage
  if (status.match(/C[0-9]+/)) { return { kind: 'copied' } }

  return { kind: 'modified' }
}

/**
 *  Retrieve the status for a given repository,
 *  and fail gracefully if the location is not a Git repository
 */
export async function getStatus(repository: Repository): Promise<IStatusResult> {
  const result = await git([ 'status', '--untracked-files=all', '--branch', '--porcelain=2', '-z' ], repository.path, 'getStatus')

  const files = new Array<WorkingDirectoryFileChange>()

  let currentBranch: string | undefined = undefined
  let currentUpstreamBranch: string | undefined = undefined
  let currentTip: string | undefined = undefined
  let branchAheadBehind: IAheadBehind | undefined = undefined

  for (const entry of parsePorcelainStatus(result.stdout)) {
    if (entry.kind === 'entry') {
      const status = mapStatus(entry.statusCode)
      // for now we just poke at the existing summary
      const summary = convertToAppStatus(status.kind)
      const selection = DiffSelection.fromInitialSelection(DiffSelectionType.All)

      files.push(new WorkingDirectoryFileChange(entry.path, summary, selection, entry.oldPath))
    } else if (entry.kind === 'header') {
      let m: RegExpMatchArray | null
      const value = entry.value

      // This intentionally does not match branch.oid initial
      if (m = value.match(/^branch\.oid ([a-f0-9]+)$/)) {
        currentTip = m[1]
      } else if (m = value.match(/^branch.head (.*)/)) {
        if (m[1] !== '(detached)') {
          currentBranch = m[1]
        }
      } else if (m = value.match(/^branch.upstream (.*)/)) {
        currentUpstreamBranch = m[1]
      } else if (m = value.match(/^branch.ab \+(\d+) -(\d+)$/)) {
        const ahead = parseInt(m[1], 10)
        const behind = parseInt(m[2], 10)

        if (!isNaN(ahead) && !isNaN(behind)) {
          branchAheadBehind = { ahead, behind }
        }
      }
    }
  }

  const workingDirectory = new WorkingDirectoryStatus(files, true)

  return {
    currentBranch,
    currentTip,
    currentUpstreamBranch,
    branchAheadBehind,
    exists: true,
    workingDirectory,
  }
}
