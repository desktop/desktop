import { ManualConflictResolution } from '../../../models/manual-conflict-resolution'
import {
  ConflictedFileStatus,
  GitStatusEntry,
  isManualConflict,
  ManualConflict,
} from '../../../models/status'
import * as octicons from '../../octicons/octicons.generated'

export type CopilotFileResolutionChoice = 'copilot' | 'ours' | 'theirs'

/** Label and icon for each resolution choice. */
export const resolutionChoices = {
  copilot: { label: 'Copilot', icon: octicons.copilot },
  ours: { label: 'Current', icon: octicons.chevronLeft },
  theirs: { label: 'Incoming', icon: octicons.chevronRight },
} as const

/**
 * Derive the resolution choice for a file from the manual resolutions map.
 * Defaults to 'copilot' when no manual override is set.
 */
export function getResolutionChoiceForFile(
  path: string,
  manualResolutions: Map<string, ManualConflictResolution>
): CopilotFileResolutionChoice {
  const manual = manualResolutions.get(path)
  if (manual === ManualConflictResolution.ours) {
    return 'ours'
  }
  if (manual === ManualConflictResolution.theirs) {
    return 'theirs'
  }
  return 'copilot'
}

/**
 * Returns true when the conflicted file status represents a delete-vs-modify
 * conflict: one side deleted the file, the other modified it.
 */
export function isDeleteConflictFile(
  status: ConflictedFileStatus
): status is ManualConflict {
  if (!isManualConflict(status)) {
    return false
  }
  const { us, them } = status.entry
  return (
    (us === GitStatusEntry.Deleted && them !== GitStatusEntry.Deleted) ||
    (them === GitStatusEntry.Deleted && us !== GitStatusEntry.Deleted)
  )
}

/**
 * For a delete-vs-modify conflict, returns which side deleted the file.
 */
export function getDeletedSide(
  status: ManualConflict
): 'ours' | 'theirs' | undefined {
  if (status.entry.us === GitStatusEntry.Deleted) {
    return 'ours'
  }
  if (status.entry.them === GitStatusEntry.Deleted) {
    return 'theirs'
  }
  return undefined
}

/**
 * Context menu labels for a delete-vs-modify conflict file. Returns
 * user-friendly labels like "Keep file (from branch-x)" and
 * "Delete file (from branch-y)" mapped to 'ours' and 'theirs'.
 */
export function getDeleteConflictLabels(
  status: ManualConflict,
  ourBranch?: string,
  theirBranch?: string
): { readonly oursLabel: string; readonly theirsLabel: string } {
  const deletedSide = getDeletedSide(status)

  if (deletedSide === 'ours') {
    const keepSuffix = theirBranch ? ` from ${theirBranch}` : ''
    const deleteSuffix = ourBranch ? ` on ${ourBranch}` : ''
    return {
      oursLabel: `Delete file${deleteSuffix}`,
      theirsLabel: `Keep file${keepSuffix}`,
    }
  }

  const keepSuffix = ourBranch ? ` from ${ourBranch}` : ''
  const deleteSuffix = theirBranch ? ` on ${theirBranch}` : ''
  return {
    oursLabel: `Keep file${keepSuffix}`,
    theirsLabel: `Delete file${deleteSuffix}`,
  }
}

/**
 * For a delete-vs-modify conflict, returns the resolution choice label
 * ("Keep file" or "Delete file") for the current choice.
 */
export function getDeleteConflictChoiceLabel(
  choice: CopilotFileResolutionChoice,
  status: ManualConflict
): string {
  const deletedSide = getDeletedSide(status)

  if (choice === 'copilot') {
    return 'Copilot'
  }

  if (deletedSide === 'ours') {
    return choice === 'ours' ? 'Delete file' : 'Keep file'
  }

  return choice === 'ours' ? 'Keep file' : 'Delete file'
}

/**
 * Returns the ours/theirs dropdown labels for a conflicted file, handling
 * both delete-vs-modify and regular text conflicts.
 */
export function getOursTheirsLabels(
  status: ConflictedFileStatus | undefined,
  ourBranch?: string,
  theirBranch?: string
): { readonly oursLabel: string; readonly theirsLabel: string } {
  if (status !== undefined && isDeleteConflictFile(status)) {
    return getDeleteConflictLabels(status, ourBranch, theirBranch)
  }

  const oursLabel = ourBranch
    ? `Use current file from ${ourBranch}`
    : 'Use current file'
  const theirsLabel = theirBranch
    ? `Use incoming file from ${theirBranch}`
    : 'Use incoming file'
  return { oursLabel, theirsLabel }
}
