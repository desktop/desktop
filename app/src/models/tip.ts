import { Branch } from './branch'

export enum TipState {
  Unknown,
  Unborn,
  Detached,
  Valid
}

export interface IUnknownRepository {
   readonly kind: TipState.Unknown
}

export interface IUnbornRepository {
   readonly kind: TipState.Unborn
}

export interface IDetachedHead {
   readonly kind: TipState.Detached
   readonly currentSha: string
}

export interface IValidBranch {
   readonly kind: TipState.Valid
   readonly branch: Branch
}

export type Tip =
  IUnknownRepository |
  IUnbornRepository |
  IDetachedHead |
  IValidBranch
