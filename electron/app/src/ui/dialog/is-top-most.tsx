import memoizeOne from 'memoize-one'

/** This method is a memoizedOne for a consistent means of handling when the
 * isTopMost property of the `DialogStackContext` changes in the various popups
 * that consume it.  */
export function isTopMostDialog(
  onDialogIsTopMost: () => void,
  onDialogIsNotTopMost: () => void
) {
  return memoizeOne((isTopMost: boolean) => {
    if (isTopMost) {
      onDialogIsTopMost()
    } else {
      onDialogIsNotTopMost()
    }
  })
}
