import { TipState, Tip } from '../models/tip'
import { StartPoint, Branch } from '../models/branch'

type BranchInfo = {
  readonly tip: Tip
  readonly defaultBranch: Branch | null
}

export function getStartPoint(
  props: BranchInfo,
  preferred: StartPoint
): StartPoint {
  if (preferred === StartPoint.DefaultBranch && props.defaultBranch) {
    return preferred
  }

  if (
    preferred === StartPoint.CurrentBranch &&
    props.tip.kind === TipState.Valid
  ) {
    return preferred
  }

  if (preferred === StartPoint.Head) {
    return preferred
  }

  if (props.defaultBranch) {
    return StartPoint.DefaultBranch
  } else if (props.tip.kind === TipState.Valid) {
    return StartPoint.CurrentBranch
  } else {
    return StartPoint.Head
  }
}
