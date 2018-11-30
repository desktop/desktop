import { getBoolean, setBoolean } from '../local-storage'

/** The `localStorage` for whether we've shown the usage stats change notice. */
const HasSeenUsageStatsNoteKey = 'has-seen-usage-stats-note'

/**
 * Check if the current user has acknowledged the usage stats change
 */
export function hasSeenUsageStatsNote(): boolean {
  return getBoolean(HasSeenUsageStatsNoteKey, false)
}

/**
 * Update local storage to indicate the usage stats dialog has been seen
 */
export function markUsageStatsNoteSeen() {
  setBoolean(HasSeenUsageStatsNoteKey, true)
}
