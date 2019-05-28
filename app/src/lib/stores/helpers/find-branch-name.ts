import { Tip, TipState } from '../../../models/tip'

/**
 * Function to determine which branch name to use when looking for branch
 * protection information.
 *
 * Currently ignores any remote-specific information, in favour of just looking
 * at the tracking branch name (if set).
 */
export function findBranchName(tip: Tip): string | null {
  if (tip.kind !== TipState.Valid) {
    return null
  }

  if (tip.branch.upstreamWithoutRemote !== null) {
    return tip.branch.upstreamWithoutRemote
  }

  return tip.branch.nameWithoutRemote
}
