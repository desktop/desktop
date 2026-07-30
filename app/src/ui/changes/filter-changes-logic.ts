import { IFileListFilterState } from '../../lib/app-state'
import { IChangesListItem } from './filter-changes-list'
import memoizeOne from 'memoize-one'
import { AppFileStatusKind } from '../../models/status'

export function getItemCommitState(item: IChangesListItem) {
  if (item.section !== undefined) {
    return {
      isIncludedInCommit: item.section === 'staged',
      isExcludedFromCommit: item.section === 'unstaged',
    }
  }

  return {
    isIncludedInCommit: item.change.isIncludedInCommit(),
    isExcludedFromCommit: item.change.isExcludedFromCommit(),
  }
}

/**
 * Apply filter options to determine if a file should be shown
 * Uses AND logic - file must satisfy ALL active filters
 * Note: This is applied after the filterText has been applied
 */
export function applyFilterOptions(
  item: IChangesListItem,
  filters: IFileListFilterState
): boolean {
  // If no filters are active, show all files
  if (countActiveFilterOptions(filters) === 0) {
    return true
  }

  const { change } = item
  const status = item.status ?? change.status
  const { isIncludedInCommit, isExcludedFromCommit } = getItemCommitState(item)

  if (filters.isIncludedInCommit && !isIncludedInCommit) {
    return false
  }

  if (filters.isExcludedFromCommit && !isExcludedFromCommit) {
    return false
  }

  if (
    filters.isNewFile &&
    status.kind !== AppFileStatusKind.New &&
    status.kind !== AppFileStatusKind.Untracked
  ) {
    return false
  }

  if (filters.isModifiedFile && status.kind !== AppFileStatusKind.Modified) {
    return false
  }

  if (filters.isDeletedFile && status.kind !== AppFileStatusKind.Deleted) {
    return false
  }

  // File matches all active filters
  return true
}

/**
 * Check if any files being committed are hidden by the current filter
 * Memoized to avoid recalculating for the same inputs
 */
export const isCommittingFileHiddenByFilter = memoizeOne(
  (
    fileIdsIncludedInCommit: ReadonlyArray<string>,
    filteredItems: Map<string, IChangesListItem>,
    _fileCount: number,
    filters: IFileListFilterState
  ): boolean => {
    const visibleFileIds = new Set<string>()

    for (const [id, item] of filteredItems) {
      if (item.section !== 'unstaged') {
        visibleFileIds.add(item.change?.id ?? id)
      }
    }

    if (!hasActiveFilters(filters)) {
      return false
    }

    // If filtered rows count is 1 and included for commit rows count is 2,
    // there is no way the included for commit rows are visible regardless of
    // what they are.
    if (fileIdsIncludedInCommit.length > visibleFileIds.size) {
      return true
    }

    // If we can find a file id included in the commit that does not exist in
    // the filtered items, then we are committing a hidden file.
    return fileIdsIncludedInCommit.some(fId => !visibleFileIds.has(fId))
  }
)

/**
 * Generate message when no files match filters
 */
export function getNoResultsMessage(
  filters: IFileListFilterState
): string | undefined {
  if (!hasActiveFilters(filters)) {
    return undefined
  }

  const activeFilters: string[] = []

  if (filters.filterText) {
    activeFilters.push(`"${filters.filterText}"`)
  }

  if (filters.isIncludedInCommit) {
    activeFilters.push('Included in commit')
  }

  if (filters.isExcludedFromCommit) {
    activeFilters.push('Excluded from commit')
  }

  if (filters.isNewFile) {
    activeFilters.push('New files')
  }

  if (filters.isModifiedFile) {
    activeFilters.push('Modified files')
  }

  if (filters.isDeletedFile) {
    activeFilters.push('Deleted files')
  }

  if (activeFilters.length === 0) {
    return undefined
  }

  // Format the list with proper grammar (e.g., "A, B, and C")
  let filterList: string
  if (activeFilters.length === 1) {
    filterList = activeFilters[0]
  } else if (activeFilters.length === 2) {
    filterList = `${activeFilters[0]} and ${activeFilters[1]}`
  } else {
    const lastFilter = activeFilters[activeFilters.length - 1]
    const otherFilters = activeFilters.slice(0, -1)
    filterList = `${otherFilters.join(', ')}, and ${lastFilter}`
  }
  return `Sorry, I can't find any changed files matching the following filters: ${filterList}`
}

/**
 * Count the number of active filter options
 * Note: This does not include the filterText filter
 */
export function countActiveFilterOptions(
  filters: IFileListFilterState
): number {
  return [
    filters.isIncludedInCommit,
    filters.isNewFile,
    filters.isModifiedFile,
    filters.isDeletedFile,
    filters.isExcludedFromCommit,
  ].filter(Boolean).length
}

/**
 * Check if there are any active filters
 */
export function hasActiveFilters(filters: IFileListFilterState): boolean {
  return filters.filterText !== '' || countActiveFilterOptions(filters) > 0
}

/**
 * Apply filters to a changes list item
 * Memoized to avoid recalculating for the same inputs
 */
export const applyFilters = memoizeOne(
  (
    item: IChangesListItem,
    showChangesFilter: boolean,
    filters: IFileListFilterState
  ) => {
    if (!showChangesFilter) {
      return true
    }

    return applyFilterOptions(item, filters)
  }
)
