import { ManualConflictResolution } from '../../../models/manual-conflict-resolution'
import {
  ConflictedFileStatus,
  isManualConflict,
  UnmergedEntrySummary,
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
 *
 * For files with text conflict markers the default is `'copilot'`.
 * For delete-vs-modify conflicts the default is the surviving (non-deleted)
 * side, since Copilot cannot produce a resolution for these.
 */
export function getResolutionChoiceForFile(
  path: string,
  manualResolutions: Map<string, ManualConflictResolution>,
  fileStatus?: ConflictedFileStatus
): CopilotFileResolutionChoice {
  const manual = manualResolutions.get(path)
  if (manual === ManualConflictResolution.ours) {
    return 'ours'
  }
  if (manual === ManualConflictResolution.theirs) {
    return 'theirs'
  }

  // Delete-vs-modify conflicts can't be resolved by Copilot — default to
  // the surviving (non-deleted) side instead.
  if (fileStatus !== undefined && isDeleteModifyConflict(fileStatus)) {
    return getDefaultDeleteModifyChoice(fileStatus.entry.action)
  }

  return 'copilot'
}

/**
 * Whether a conflicted file status represents a delete-vs-modify (or
 * both-deleted) conflict — i.e. one that has no text conflict markers and
 * requires the user to choose between keeping or deleting the file.
 */
export function isDeleteModifyConflict(status: ConflictedFileStatus): boolean {
  if (!isManualConflict(status)) {
    return false
  }
  return (
    status.entry.action === UnmergedEntrySummary.DeletedByUs ||
    status.entry.action === UnmergedEntrySummary.DeletedByThem ||
    status.entry.action === UnmergedEntrySummary.BothDeleted
  )
}

/**
 * Return the default resolution choice for a delete-vs-modify conflict:
 * keep the surviving (modified) side.
 */
export function getDefaultDeleteModifyChoice(
  action: UnmergedEntrySummary
): CopilotFileResolutionChoice {
  switch (action) {
    case UnmergedEntrySummary.DeletedByThem:
      // Our side modified the file, their side deleted it → keep ours
      return 'ours'
    case UnmergedEntrySummary.DeletedByUs:
      // Our side deleted the file, their side modified it → keep theirs
      return 'theirs'
    case UnmergedEntrySummary.BothDeleted:
      // Both sides deleted — either choice means deletion
      return 'ours'
    default:
      return 'ours'
  }
}

/**
 * Return the {@link ManualConflictResolution} corresponding to a
 * {@link CopilotFileResolutionChoice}.
 */
export function choiceToManualResolution(
  choice: CopilotFileResolutionChoice
): ManualConflictResolution | null {
  switch (choice) {
    case 'ours':
      return ManualConflictResolution.ours
    case 'theirs':
      return ManualConflictResolution.theirs
    case 'copilot':
      return null
  }
}
