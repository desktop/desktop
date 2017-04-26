import { git } from './core'
import { WorkingDirectoryStatus, WorkingDirectoryFileChange, FileStatus } from '../../models/status'
import { parsePorcelainStatus } from '../status-parser'
import { DiffSelectionType, DiffSelection } from '../../models/diff'
import { Repository } from '../../models/repository'

/** The encapsulation of the result from 'git status' */
export class StatusResult {
  /** true if the repository exists at the given location */
  public readonly exists: boolean

  /** the absolute path to the repository's working directory */
  public readonly workingDirectory: WorkingDirectoryStatus

  /** factory method when 'git status' is unsuccessful */
  public static NotFound(): StatusResult {
    return new StatusResult(false, new WorkingDirectoryStatus(new Array<WorkingDirectoryFileChange>(), true))
  }

  /** factory method for a successful 'git status' result  */
  public static FromStatus(status: WorkingDirectoryStatus): StatusResult {
    return new StatusResult(true, status)
  }

  public constructor(exists: boolean, workingDirectory: WorkingDirectoryStatus) {
    this.exists = exists
    this.workingDirectory = workingDirectory
  }
}

/**
 * map the raw status text from Git to an app-friendly value
 * shamelessly borrowed from GitHub Desktop (Windows)
 */
export function mapStatus(rawStatus: string): FileStatus {

  // TODO: This is due to the fact that porcelain V2 changed from
  // using space to using a dot when either side is unmodified.
  // We should probably parse this properly.
  const status = rawStatus.replace('.', '')

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
  if (status.match(/R[0-9]{3}/)) { return FileStatus.Renamed }

  // git log -C --name-status will return a CXXX - where XXX is a percentage
  if (status.match(/C[0-9]{3}/)) { return FileStatus.Copied }

  return FileStatus.Modified
}

/**
 *  Retrieve the status for a given repository,
 *  and fail gracefully if the location is not a Git repository
 */
export async function getStatus(repository: Repository): Promise<StatusResult> {
  const result = await git([ 'status', '--untracked-files=all', '--porcelain=2', '-z' ], repository.path, 'getStatus')

  const files = new Array<WorkingDirectoryFileChange>()

  for (const entry of parsePorcelainStatus(result.stdout)) {
    if (entry.kind === 'entry') {
      const status = mapStatus(entry.statusCode)
      const selection = DiffSelection.fromInitialSelection(DiffSelectionType.All)

      files.push(new WorkingDirectoryFileChange(entry.path, status, selection, entry.oldPath))
    }
  }

  return StatusResult.FromStatus(new WorkingDirectoryStatus(files, true))
}
