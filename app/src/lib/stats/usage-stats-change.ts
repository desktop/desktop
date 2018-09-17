/** The `localStorage` for whether we've shown the usage stats change notice. */
const HasSeenUsageStatsNoteKey = 'has-seen-usage-stats-note'

/**
 * Check if the current user has acknowledged the usage stats change
 */
export function hasSeenUsageStatsNote(): boolean {
  const hasSeenUsageStatsNote = localStorage.getItem(HasSeenUsageStatsNoteKey)
  if (!hasSeenUsageStatsNote) {
    return false
  }

  const value = parseInt(hasSeenUsageStatsNote, 10)
  return value === 1
}

/**
 * Update local storage to indicate the usage stats dialog has been seen
 */
export function markUsageStatsNoteSeen() {
  localStorage.setItem(HasSeenUsageStatsNoteKey, '1')
}
