import { getBoolean } from '../../lib/local-storage'

/**
 * A set of the diff view modes (unified, split, mixed)
 * The mixed mode uses unified for added and deleted files,
 * and split for modified or moved files.
 */
export enum DiffViewMode {
  Unified = 'unified',
  Split = 'split',
  Mixed = 'mixed',
}

/**
 * The legacy key which stored true for split and false for unified
 * diff view mode.
 */
const showSideBySideDiffKey = 'show-side-by-side-diff'

/**
 * The key under which the diff view mode is stored in local storage.
 */
const diffViewModeKey = 'diff-view-mode'

/**
 * Function to preserve and convert the legacy diff view mode settings.
 */
function migrateDiffViewMode(): DiffViewMode | null {
  const showSideBySideDiff = getBoolean(
    showSideBySideDiffKey
  );

  if (showSideBySideDiff !== null) {
    localStorage.removeItem(showSideBySideDiffKey)

    if (!showSideBySideDiff) {
      return DiffViewMode.Unified
    }

    return DiffViewMode.Split
  }

  return null
}

export function getDiffViewMode(): DiffViewMode {
  const storedMode = localStorage.getItem(diffViewModeKey)

  if (
    storedMode === DiffViewMode.Unified ||
    storedMode === DiffViewMode.Split ||
    storedMode === DiffViewMode.Mixed
  ) {
    return storedMode
  }

  const migratedMode = migrateDiffViewMode()

  if (migratedMode) {
    setDiffViewMode(migratedMode)
    return migratedMode
  }

  return DiffViewMode.Unified
}

export function setDiffViewMode(mode: DiffViewMode) {
  localStorage.setItem(diffViewModeKey, mode)
}
