import { Branch } from './branch'
import { assertNever } from '../lib/fatal-error'

export enum TipState {
  Unknown = 'Unknown',
  Unborn = 'Unborn',
  Detached = 'Detached',
  Valid = 'Valid',
}

export interface IUnknownRepository {
  readonly kind: TipState.Unknown
}

export interface IUnbornRepository {
  readonly kind: TipState.Unborn

  /**
   * The symbolic reference that the unborn repository points to currently.
   *
   * Typically this will be "master" but a user can easily create orphaned
   * branches externally.
   */
  readonly ref: string
}

export interface IDetachedHead {
  readonly kind: TipState.Detached
  /**
   * The commit identifier of the current tip of the repository.
   */
  readonly currentSha: string
}

export interface IValidBranch {
  readonly kind: TipState.Valid
  /**
   * The branch information associated with the current tip of the repository.
   */
  readonly branch: Branch
}

export type Tip =
  | IUnknownRepository
  | IUnbornRepository
  | IDetachedHead
  | IValidBranch

/**
 * Gets a value indicating whether two Tip instances refer to the
 * same canonical Git state.
 */
export function tipEquals(x: Tip, y: Tip) {
  if (x === y) {
    return true
  }

  const kind = x.kind
  switch (x.kind) {
    case TipState.Unknown:
      return x.kind === y.kind
    case TipState.Unborn:
      return x.kind === y.kind && x.ref === y.ref
    case TipState.Detached:
      return x.kind === y.kind && x.currentSha === y.currentSha
    case TipState.Valid:
      return x.kind === y.kind && branchEquals(x.branch, y.branch)
    default:
      return assertNever(x, `Unknown tip state ${kind}`)
  }
}

function branchEquals(x: Branch, y: Branch) {
  return (
    x.type === y.type &&
    x.tip.sha === y.tip.sha &&
    x.remote === y.remote &&
    x.upstream === y.upstream
  )
}
