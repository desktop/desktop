import {
  WorkingDirectoryStatus,
  WorkingDirectoryFileChange,
} from '../../../models/status'
import { IStatusResult } from '../../git'
import {
  IChangesState,
  ConflictState,
  MergeConflictState,
  isMergeConflictState,
  isRebaseConflictState,
  RebaseConflictState,
} from '../../app-state'
import { DiffSelectionType, IDiff } from '../../../models/diff'
import { caseInsensitiveCompare } from '../../compare'
import { IStatsStore } from '../../stats/stats-store'
import { ManualConflictResolution } from '../../../models/manual-conflict-resolution'

/**
 * Internal shape of the return value from this response because the compiler
 * seems to complain about attempts to create an object which satifies the
 * constraints of Pick<T,K>
 */
type ChangedFilesResult = {
  readonly workingDirectory: WorkingDirectoryStatus
  readonly selectedFileIDs: string[]
  readonly diff: IDiff | null
}

export function updateChangedFiles(
  state: IChangesState,
  status: IStatusResult,
  clearPartialState: boolean
): ChangedFilesResult {
  // Populate a map for all files in the current working directory state
  const filesByID = new Map<string, WorkingDirectoryFileChange>()
  state.workingDirectory.files.forEach(f => filesByID.set(f.id, f))

  // Attempt to preserve the selection state for each file in the new
  // working directory state by looking at the current files
  const mergedFiles = status.workingDirectory.files
    .map(file => {
      const existingFile = filesByID.get(file.id)
      if (existingFile) {
        if (clearPartialState) {
          if (
            existingFile.selection.getSelectionType() ===
            DiffSelectionType.Partial
          ) {
            return file.withIncludeAll(false)
          }
        }

        return file.withSelection(existingFile.selection)
      } else {
        return file
      }
    })
    .sort((x, y) => caseInsensitiveCompare(x.path, y.path))

  // Collect all the currently available file ids into a set to avoid O(N)
  // lookups using .find on the mergedFiles array.
  const mergedFileIds = new Set(mergedFiles.map(x => x.id))

  // The previously selected files might not be available in the working
  // directory any more due to having been committed or discarded so we'll
  // do a pass over and filter out any selected files that aren't available.
  let selectedFileIDs = state.selectedFileIDs.filter(id =>
    mergedFileIds.has(id)
  )

  // Select the first file if we don't have anything selected and we
  // have something to select.
  if (selectedFileIDs.length === 0 && mergedFiles.length > 0) {
    selectedFileIDs = [mergedFiles[0].id]
  }

  // The file selection could have changed if the previously selected files
  // are no longer selectable (they were discarded or committed) but if they
  // were not changed we can reuse the diff. Note, however that we only render
  // a diff when a single file is selected. If the previous selection was
  // a single file with the same id as the current selection we can keep the
  // diff we had, if not we'll clear it.
  const workingDirectory = WorkingDirectoryStatus.fromFiles(mergedFiles)

  const diff =
    selectedFileIDs.length === 1 &&
    state.selectedFileIDs.length === 1 &&
    state.selectedFileIDs[0] === selectedFileIDs[0]
      ? state.diff
      : null

  return {
    workingDirectory,
    selectedFileIDs,
    diff,
  }
}

/**
 * Convert the received status information into a conflict state
 */
function getConflictState(
  status: IStatusResult,
  manualResolutions: Map<string, ManualConflictResolution>
): ConflictState | null {
  if (status.mergeHeadFound) {
    const { currentBranch, currentTip } = status
    if (currentBranch == null || currentTip == null) {
      return null
    }
    return {
      kind: 'merge',
      currentBranch,
      currentTip,
      manualResolutions,
    }
  }

  if (status.rebaseInternalState !== null) {
    const { currentTip } = status
    if (currentTip == null) {
      return null
    }

    const {
      targetBranch,
      originalBranchTip,
      baseBranchTip,
    } = status.rebaseInternalState

    return {
      kind: 'rebase',
      currentTip,
      manualResolutions,
      targetBranch,
      originalBranchTip,
      baseBranchTip,
    }
  }

  return null
}

function performEffectsForMergeStateChange(
  prevConflictState: MergeConflictState | null,
  newConflictState: MergeConflictState | null,
  status: IStatusResult,
  statsStore: IStatsStore
): void {
  const previousBranchName =
    prevConflictState != null ? prevConflictState.currentBranch : null
  const currentBranchName =
    newConflictState != null ? newConflictState.currentBranch : null

  const branchNameChanged =
    previousBranchName != null &&
    currentBranchName != null &&
    previousBranchName !== currentBranchName

  // The branch name has changed while remaining conflicted -> the merge must have been aborted
  if (branchNameChanged) {
    statsStore.recordMergeAbortedAfterConflicts()
    return
  }

  const { currentTip } = status

  // if the repository is no longer conflicted, what do we think happened?
  if (
    prevConflictState != null &&
    newConflictState == null &&
    currentTip != null
  ) {
    const previousTip = prevConflictState.currentTip

    if (previousTip !== currentTip) {
      statsStore.recordMergeSuccessAfterConflicts()
    } else {
      statsStore.recordMergeAbortedAfterConflicts()
    }
  }
}

function performEffectsForRebaseStateChange(
  prevConflictState: RebaseConflictState | null,
  newConflictState: RebaseConflictState | null,
  status: IStatusResult,
  statsStore: IStatsStore
) {
  const previousBranchName =
    prevConflictState != null ? prevConflictState.targetBranch : null
  const currentBranchName =
    newConflictState != null ? newConflictState.targetBranch : null

  const branchNameChanged =
    previousBranchName != null &&
    currentBranchName != null &&
    previousBranchName !== currentBranchName

  // The branch name has changed while remaining conflicted -> the rebase must have been aborted
  if (branchNameChanged) {
    statsStore.recordRebaseAbortedAfterConflicts()
    return
  }

  const { currentTip, currentBranch } = status

  // if the repository is no longer conflicted, what do we think happened?
  if (
    prevConflictState != null &&
    newConflictState == null &&
    currentTip != null &&
    currentBranch != null
  ) {
    const previousTip = prevConflictState.originalBranchTip

    if (
      previousTip !== currentTip &&
      currentBranch === prevConflictState.targetBranch
    ) {
      statsStore.recordRebaseSuccessAfterConflicts()
    } else {
      statsStore.recordRebaseAbortedAfterConflicts()
    }
  }

  return
}

export function updateConflictState(
  state: IChangesState,
  status: IStatusResult,
  statsStore: IStatsStore
): ConflictState | null {
  const prevConflictState = state.conflictState

  const manualResolutions =
    prevConflictState !== null
      ? prevConflictState.manualResolutions
      : new Map<string, ManualConflictResolution>()

  const newConflictState = getConflictState(status, manualResolutions)

  if (prevConflictState == null && newConflictState == null) {
    return null
  }

  if (
    (prevConflictState == null || isMergeConflictState(prevConflictState)) &&
    (newConflictState == null || isMergeConflictState(newConflictState))
  ) {
    performEffectsForMergeStateChange(
      prevConflictState,
      newConflictState,
      status,
      statsStore
    )
    return newConflictState
  }

  if (
    (prevConflictState == null || isRebaseConflictState(prevConflictState)) &&
    (newConflictState == null || isRebaseConflictState(newConflictState))
  ) {
    performEffectsForRebaseStateChange(
      prevConflictState,
      newConflictState,
      status,
      statsStore
    )
    return newConflictState
  }

  // Otherwise we transitioned from a merge conflict to a rebase conflict or
  // vice versa, and we should avoid any side effects here

  return newConflictState
}
