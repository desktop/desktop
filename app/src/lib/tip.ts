import { TipState, Tip } from '../models/tip'

export function getTipSha(tip: Tip) {
  if (tip.kind === TipState.Valid) {
    return tip.branch.tip.sha
  }

  if (tip.kind === TipState.Detached) {
    return tip.currentSha
  }
  return '(unknown)'
}
