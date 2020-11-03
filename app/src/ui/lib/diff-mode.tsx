import { getBoolean, setBoolean } from '../../lib/local-storage'

export const showSideBySideDiffDefault = false
export const showSideBySideDiffKey = 'show-side-by-side-diff'

export function getShowSideBySideDiff(): boolean {
  return getBoolean(showSideBySideDiffKey, showSideBySideDiffDefault)
}

export function setShowSideBySideDiff(showSideBySideDiff: boolean) {
  setBoolean(showSideBySideDiffKey, showSideBySideDiff)
}
