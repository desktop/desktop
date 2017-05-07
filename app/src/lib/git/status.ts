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

/**
 * map the raw status text from Git to an app-friendly value
 * shamelessly borrowed from GitHub Desktop (Windows)
 */
export function mapStatus(rawStatus: string): AppFileStatus {

  // TODO: This is due to the fact that porcelain V2 changed from
  // using space to using a dot when either side is unmodified.
  // We should probably parse this properly. We still trim the space
  // since mapStatus is used from log.ts as well which passes
  // porcelain v1 status codes.
  const status = rawStatus.replace(/[ .]/, '')

  if (status === 'M') { return AppFileStatus.Modified }      // modified
  if (status === 'A') { return AppFileStatus.New }           // added
  if (status === 'D') { return AppFileStatus.Deleted }       // deleted
  if (status === 'R') { return AppFileStatus.Renamed }       // renamed
  if (status === 'C') { return AppFileStatus.Copied }        // copied
  if (status === 'AM') { return AppFileStatus.New }          // added in index, modified in working directory
  if (status === 'RM') { return AppFileStatus.Renamed }      // renamed in index, modified in working directory
  if (status === 'RD') { return AppFileStatus.Conflicted }   // renamed in index, deleted in working directory
  if (status === 'DD') { return AppFileStatus.Conflicted }   // Unmerged, both deleted
  if (status === 'AU') { return AppFileStatus.Conflicted }   // Unmerged, added by us
  if (status === 'UD') { return AppFileStatus.Conflicted }   // Unmerged, deleted by them
  if (status === 'UA') { return AppFileStatus.Conflicted }   // Unmerged, added by them
  if (status === 'DU') { return AppFileStatus.Conflicted }   // Unmerged, deleted by us
  if (status === 'AA') { return AppFileStatus.Conflicted }   // Unmerged, added by both
  if (status === 'UU') { return AppFileStatus.Conflicted }   // Unmerged, both modified
  if (status === '??') { return AppFileStatus.New }          // untracked

  // git log -M --name-status will return a RXXX - where XXX is a percentage
  if (status.match(/R[0-9]+/)) { return AppFileStatus.Renamed }

  // git log -C --name-status will return a CXXX - where XXX is a percentage
  if (status.match(/C[0-9]+/)) { return AppFileStatus.Copied }

  return AppFileStatus.Modified
}

/**
 * map the raw status text from Git to an app-friendly value
 * shamelessly borrowed from GitHub Desktop (Windows)
 */
export function mapStatusV2(rawStatus: string): FileStatus {

  // TODO: This is due to the fact that porcelain V2 changed from
  // using space to using a dot when either side is unmodified.
  // We should probably parse this properly. We still trim the space
  // since mapStatus is used from log.ts as well which passes
  // porcelain v1 status codes.
  const status = rawStatus.replace(/[ .]/, '')

  if (status === 'M') { return { kind: AppFileStatus.Modified } }
  if (status === 'A') { return { kind: AppFileStatus.New } }
  if (status === 'D') { return { kind: AppFileStatus.Deleted } }
  if (status === 'R') { return { kind: AppFileStatus.Renamed } }
  if (status === 'C') { return { kind: AppFileStatus.Copied } }

  if (status === 'AM') {
    return {
      kind: AppFileStatus.New,
      staged: GitFileStatus.Added,
      unstaged: GitFileStatus.Modified,
    }
  }

  if (status === 'RM') {
    return {
      kind: AppFileStatus.Renamed,
      staged: GitFileStatus.Renamed,
      unstaged: GitFileStatus.Modified,
    }
  }

  if (status === 'RD') {
    // renamed in index, deleted in working directory
    // TODO: review this and see whether "Conflicted" is still the right code
    return {
      kind: AppFileStatus.Conflicted,
      staged: GitFileStatus.Renamed,
      unstaged: GitFileStatus.Deleted,
    }
  }

  if (status === 'DD') {
    return {
      kind: AppFileStatus.Conflicted,
      us: GitFileStatus.Deleted,
      them: GitFileStatus.Deleted,
    }
  }

  if (status === 'AU') {
    return {
      kind: AppFileStatus.Conflicted,
      us: GitFileStatus.Added,
      them: GitFileStatus.Modified,
    }
  }

  if (status === 'UD') {
    return {
      kind: AppFileStatus.Conflicted,
      us: GitFileStatus.Modified,
      them: GitFileStatus.Deleted,
    }
  }

  if (status === 'UA') {
    return {
      kind: AppFileStatus.Conflicted,
      us: GitFileStatus.Modified,
      them: GitFileStatus.Added,
    }
  }

  if (status === 'DU') {
    return {
      kind: AppFileStatus.Conflicted,
      us: GitFileStatus.Deleted,
      them: GitFileStatus.Modified,
    }
  }

  if (status === 'AA') {
    return {
      kind: AppFileStatus.Conflicted,
      us: GitFileStatus.Added,
      them: GitFileStatus.Added,
    }
  }

    if (status === 'UU') {
    return {
      kind: AppFileStatus.Conflicted,
      us: GitFileStatus.Modified,
      them: GitFileStatus.Modified,
    }
  }

  if (status === '??') {
    return { kind: AppFileStatus.New }
  }

  // git log -M --name-status will return a RXXX - where XXX is a percentage
  if (status.match(/R[0-9]+/)) { return { kind: AppFileStatus.Renamed } }

  // git log -C --name-status will return a CXXX - where XXX is a percentage
  if (status.match(/C[0-9]+/)) { return { kind: AppFileStatus.Copied } }

  return { kind: AppFileStatus.Modified }
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
      const status = mapStatusV2(entry.statusCode)
      // for now we just poke at the existing summary
      const summary = status.kind
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
