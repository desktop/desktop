import { Tip, TipState } from '../../../models/tip'
import {
  IInferredComparisonBranchState,
  IRepositoryState,
} from '../../app-state'

export class DivergingBranchNotifier {
  private tip: Tip = this.repositoryState.branchesState.tip

  public constructor(private repositoryState: IRepositoryState) {}

  public shouldShowBanner(
    inferredBranchState: IInferredComparisonBranchState
  ): boolean {
    const { branch, aheadBehind, lastAheadBehind } = inferredBranchState

    if (branch === null || this.tip.kind !== TipState.Valid) {
      return false
    }

    // we only want to show the banner when the the number
    // commits behind has changed since the last it was visible
    // or when this is the first time the notification will be shown
    const result =
      aheadBehind !== null &&
      aheadBehind.behind > 0 &&
      lastAheadBehind !== null &&
      (aheadBehind.behind > 0 || aheadBehind.behind !== lastAheadBehind.behind)

    return result
  }
}
