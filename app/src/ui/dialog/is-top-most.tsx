import memoizeOne from 'memoize-one'

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
