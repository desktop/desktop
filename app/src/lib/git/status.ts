import { spawnAndComplete } from './spawn'
import { getFilesWithConflictMarkers } from './diff-check'
import {
  WorkingDirectoryStatus,
  WorkingDirectoryFileChange,
  AppFileStatus,
  FileEntry,
  GitStatusEntry,
  AppFileStatusKind,
  UnmergedEntry,
  ConflictedFileStatus,
  UnmergedEntrySummary,
} from '../../models/status'
import {
  parsePorcelainStatus,
  mapStatus,
  IStatusEntry,
  IStatusHeader,
  isStatusHeader,
  isStatusEntry,
} from '../status-parser'
import { DiffSelectionType, DiffSelection } from '../../models/diff'
import { Repository } from '../../models/repository'
import { IAheadBehind } from '../../models/branch'
import { fatalError } from '../../lib/fatal-error'
import { enableStatusWithoutOptionalLocks } from '../feature-flag'
import { isMergeHeadSet } from './merge'

/**
 * V8 has a limit on the size of string it can create (~256MB), and unless we want to
 * trigger an unhandled exception we need to do the encoding conversion by hand.
 *
 * As we may be executing status often, we should keep this to a reasonable threshold.
 */
const MaxStatusBufferSize = 20e6 // 20MB in decimal

/** The encapsulation of the result from 'git status' */
export interface IStatusResult {
  /** The name of the current branch */
  readonly currentBranch?: string

  /** The name of the current upstream branch */
  readonly currentUpstreamBranch?: string

  /** The SHA of the tip commit of the current branch */
  readonly currentTip?: string

  /** How many commits ahead and behind
   *  the `currentBranch` is compared to the `currentUpstreamBranch`
   */
  readonly branchAheadBehind?: IAheadBehind

  /** true if the repository exists at the given location */
  readonly exists: boolean

  /** true if repository is in a conflicted state */
  readonly mergeHeadFound: boolean

  /** the absolute path to the repository's working directory */
  readonly workingDirectory: WorkingDirectoryStatus
}

interface IStatusHeadersData {
  currentBranch?: string
  currentUpstreamBranch?: string
  currentTip?: string
  branchAheadBehind?: IAheadBehind
  match: RegExpMatchArray | null
}

type ConflictCountsByPath = ReadonlyMap<string, number>

function parseConflictedState(
  entry: UnmergedEntry,
  path: string,
  filesWithConflictMarkers: ConflictCountsByPath
): ConflictedFileStatus {
  switch (entry.action) {
    case UnmergedEntrySummary.BothAdded:
      const addedConflictsLeft = filesWithConflictMarkers.get(path) || 0
      return {
        kind: AppFileStatusKind.Conflicted,
        entry,
        lookForConflictMarkers: true,
        conflictMarkerCount: addedConflictsLeft,
      }
    case UnmergedEntrySummary.BothModified:
      const modifedConflictsLeft = filesWithConflictMarkers.get(path) || 0
      return {
        kind: AppFileStatusKind.Conflicted,
        entry,
        lookForConflictMarkers: true,
        conflictMarkerCount: modifedConflictsLeft,
      }
    default:
      return {
        kind: AppFileStatusKind.Conflicted,
        entry,
        lookForConflictMarkers: false,
      }
  }
}

function convertToAppStatus(
  path: string,
  entry: FileEntry,
  filesWithConflictMarkers: ConflictCountsByPath,
  oldPath?: string
): AppFileStatus {
  if (entry.kind === 'ordinary') {
    switch (entry.type) {
      case 'added':
        return { kind: AppFileStatusKind.New }
      case 'modified':
        return { kind: AppFileStatusKind.Modified }
      case 'deleted':
        return { kind: AppFileStatusKind.Deleted }
    }
  } else if (entry.kind === 'copied' && oldPath != null) {
    return { kind: AppFileStatusKind.Copied, oldPath }
  } else if (entry.kind === 'renamed' && oldPath != null) {
    return { kind: AppFileStatusKind.Renamed, oldPath }
  } else if (entry.kind === 'untracked') {
    return { kind: AppFileStatusKind.Untracked }
  } else if (entry.kind === 'conflicted') {
    return parseConflictedState(entry, path, filesWithConflictMarkers)
  }

  return fatalError(`Unknown file status ${status}`)
}

/**
 *  Retrieve the status for a given repository,
 *  and fail gracefully if the location is not a Git repository
 */
export async function getStatus(
  repository: Repository
): Promise<IStatusResult | null> {
  const baseArgs = [
    'status',
    '--untracked-files=all',
    '--branch',
    '--porcelain=2',
    '-z',
  ]

  const args = enableStatusWithoutOptionalLocks()
    ? ['--no-optional-locks', ...baseArgs]
    : baseArgs

  const result = await spawnAndComplete(
    args,
    repository.path,
    'getStatus',
    new Set([0, 128])
  )

  if (result.exitCode === 128) {
    log.debug(
      `'git status' returned 128 for '${
        repository.path
      }' and is likely missing its .git directory`
    )
    return null
  }

  if (result.output.length > MaxStatusBufferSize) {
    log.error(
      `'git status' emitted ${
        result.output.length
      } bytes, which is beyond the supported threshold of ${MaxStatusBufferSize} bytes`
    )
    return null
  }

  const stdout = result.output.toString('utf8')
  const parsed = parsePorcelainStatus(stdout)
  const headers = parsed.filter(isStatusHeader)
  const entries = parsed.filter(isStatusEntry)

  const mergeHeadFound = await isMergeHeadSet(repository)

  // if we have any conflicted files reported by status, let
  const conflictState = mergeHeadFound
    ? await getFilesWithConflictMarkers(repository.path)
    : new Map<string, number>()

  // Map of files keyed on their paths.
  const files = entries.reduce(
    (files, entry) => buildStatusMap(files, entry, conflictState),
    new Map<string, WorkingDirectoryFileChange>()
  )

  const {
    currentBranch,
    currentUpstreamBranch,
    currentTip,
    branchAheadBehind,
  } = headers.reduce(parseStatusHeader, {
    currentBranch: undefined,
    currentUpstreamBranch: undefined,
    currentTip: undefined,
    branchAheadBehind: undefined,
    match: null,
  })

  const workingDirectory = WorkingDirectoryStatus.fromFiles([...files.values()])

  return {
    currentBranch,
    currentTip,
    currentUpstreamBranch,
    branchAheadBehind,
    exists: true,
    mergeHeadFound,
    workingDirectory,
  }
}

/**
 *
 * Update map of working directory changes with a file status entry.
 * Reducer(ish).
 *
 * (Map is used here to maintain insertion order.)
 */
function buildStatusMap(
  files: Map<string, WorkingDirectoryFileChange>,
  entry: IStatusEntry,
  filesWithConflictMarkers: ConflictCountsByPath
): Map<string, WorkingDirectoryFileChange> {
  const status = mapStatus(entry.statusCode)

  if (status.kind === 'ordinary') {
    // when a file is added in the index but then removed in the working
    // directory, the file won't be part of the commit, so we can skip
    // displaying this entry in the changes list
    if (
      status.index === GitStatusEntry.Added &&
      status.workingTree === GitStatusEntry.Deleted
    ) {
      return files
    }
  }

  if (status.kind === 'untracked') {
    // when a delete has been staged, but an untracked file exists with the
    // same path, we should ensure that we only draw one entry in the
    // changes list - see if an entry already exists for this path and
    // remove it if found
    files.delete(entry.path)
  }

  // for now we just poke at the existing summary
  const appStatus = convertToAppStatus(
    entry.path,
    status,
    filesWithConflictMarkers,
    entry.oldPath
  )

  const selection = DiffSelection.fromInitialSelection(DiffSelectionType.All)

  files.set(
    entry.path,
    new WorkingDirectoryFileChange(entry.path, appStatus, selection)
  )
  return files
}

/**
 * Update status header based on the current header entry.
 * Reducer.
 */
function parseStatusHeader(results: IStatusHeadersData, header: IStatusHeader) {
  let {
    currentBranch,
    currentUpstreamBranch,
    currentTip,
    branchAheadBehind,
    match,
  } = results
  const value = header.value

  // This intentionally does not match branch.oid initial
  if ((match = value.match(/^branch\.oid ([a-f0-9]+)$/))) {
    currentTip = match[1]
  } else if ((match = value.match(/^branch.head (.*)/))) {
    if (match[1] !== '(detached)') {
      currentBranch = match[1]
    }
  } else if ((match = value.match(/^branch.upstream (.*)/))) {
    currentUpstreamBranch = match[1]
  } else if ((match = value.match(/^branch.ab \+(\d+) -(\d+)$/))) {
    const ahead = parseInt(match[1], 10)
    const behind = parseInt(match[2], 10)

    if (!isNaN(ahead) && !isNaN(behind)) {
      branchAheadBehind = { ahead, behind }
    }
  }
  return {
    currentBranch,
    currentUpstreamBranch,
    currentTip,
    branchAheadBehind,
    match,
  }
}
