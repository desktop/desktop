import { git } from './core'
import { WorkingDirectoryStatus, WorkingDirectoryFileChange, FileStatus } from '../../models/status'
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
export function mapStatus(rawStatus: string): FileStatus {

  // TODO: This is due to the fact that porcelain V2 changed from
  // using space to using a dot when either side is unmodified.
  // We should probably parse this properly. We still trim the space
  // since mapStatus is used from log.ts as well which passes
  // porcelain v1 status codes.
  const status = rawStatus.replace(/[ .]/, '')

  if (status === 'M') { return FileStatus.Modified }      // modified
  if (status === 'A') { return FileStatus.New }           // added
  if (status === 'D') { return FileStatus.Deleted }       // deleted
  if (status === 'R') { return FileStatus.Renamed }       // renamed
  if (status === 'C') { return FileStatus.Copied }        // copied
  if (status === 'AM') { return FileStatus.New }          // added in index, modified in working directory
  if (status === 'RM') { return FileStatus.Renamed }      // renamed in index, modified in working directory
  if (status === 'RD') { return FileStatus.Conflicted }   // renamed in index, deleted in working directory
  if (status === 'DD') { return FileStatus.Conflicted }   // Unmerged, both deleted
  if (status === 'AU') { return FileStatus.Conflicted }   // Unmerged, added by us
  if (status === 'UD') { return FileStatus.Conflicted }   // Unmerged, deleted by them
  if (status === 'UA') { return FileStatus.Conflicted }   // Unmerged, added by them
  if (status === 'DU') { return FileStatus.Conflicted }   // Unmerged, deleted by us
  if (status === 'AA') { return FileStatus.Conflicted }   // Unmerged, added by both
  if (status === 'UU') { return FileStatus.Conflicted }   // Unmerged, both modified
  if (status === '??') { return FileStatus.New }          // untracked

  // git log -M --name-status will return a RXXX - where XXX is a percentage
  if (status.match(/R[0-9]+/)) { return FileStatus.Renamed }

  // git log -C --name-status will return a CXXX - where XXX is a percentage
  if (status.match(/C[0-9]+/)) { return FileStatus.Copied }

  return FileStatus.Modified
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
      const selection = DiffSelection.fromInitialSelection(DiffSelectionType.All)

      files.push(new WorkingDirectoryFileChange(entry.path, status, selection, entry.oldPath))
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
