import { Branch } from './branch'

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
