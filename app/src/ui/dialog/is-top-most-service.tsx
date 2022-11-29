import memoizeOne from 'memoize-one'

export class IsTopMostService {
  public check = memoizeOne((isTopMost: boolean) => {
    if (isTopMost) {
      this.onDialogIsTopMost()
    } else {
      this.onDialogIsNotTopMost()
    }
  })

  public constructor(
    private onDialogIsTopMost: () => void,
    private onDialogIsNotTopMost: () => void
  ) {}

  public unmount() {
    this.onDialogIsNotTopMost()
  }
}
