import { CommittedFileChange } from './status'

export enum StashedChangesLoadStates {
  NotLoaded,
  Loading,
}

export type StashedFileChanges =
  | ReadonlyArray<CommittedFileChange>
  | StashedChangesLoadStates
