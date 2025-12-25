import { getBoolean, setBoolean } from '../../lib/local-storage'

export const ShowSideBySideDiffDefault = false
const showSideBySideDiffKey = 'show-side-by-side-diff'
const useUnifiedDiffForAdditionsAndDeletionsKey =
  'use-unified-diff-for-additions-and-deletions'

export const UseUnifiedDiffForAdditionsAndDeletionsDefault = false

/**
 * Gets a value indicating whether not to present diffs in a split view mode
 * as opposed to unified (the default).
 */
export function getShowSideBySideDiff(): boolean {
  return getBoolean(showSideBySideDiffKey, ShowSideBySideDiffDefault)
}

/**
 * Sets a local storage key indicating whether not to present diffs in a split
 * view mode as opposed to unified (the default).
 */
export function setShowSideBySideDiff(showSideBySideDiff: boolean) {
  setBoolean(showSideBySideDiffKey, showSideBySideDiff)
}

/**
 * Gets a value indicating whether to always use a unified diff when viewing
 * files that are either newly added or deleted.
 */
export function getUseUnifiedDiffForAdditionsAndDeletions() {
  return getBoolean(
    useUnifiedDiffForAdditionsAndDeletionsKey,
    UseUnifiedDiffForAdditionsAndDeletionsDefault
  )
}

/**
 * Sets a value indicating whether to always use a unified diff when viewing
 * files that are either newly added or deleted.
 */
export function setUseUnifiedDiffForAdditionsAndDeletions(value: boolean) {
  return setBoolean(useUnifiedDiffForAdditionsAndDeletionsKey, value)
}
