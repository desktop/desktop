import {
  IAssistedCommitSnapshot,
  IValidatedAssistedCommitPlan,
} from '../../../models/assisted-commit'
import { ICopilotAssistedCommitRequest } from '../../../models/copilot-assisted-commit'
import { Repository } from '../../../models/repository'
import { WorkingDirectoryFileChange } from '../../../models/status'
import { AssistedCommitError } from './error'

export interface ITreeEntry {
  readonly path: string
  readonly mode: string
  readonly sha: string
}

export type CapturedFileState =
  | { readonly kind: 'missing' | 'directory'; readonly mode: number }
  | {
      readonly kind: 'file' | 'symlink'
      readonly mode: number
      readonly bytes: Buffer
      readonly dev: number
      readonly ino: number
      readonly mtimeMs: number
      readonly ctimeMs: number
    }

export interface IIndexState {
  readonly bytes: Buffer | null
  readonly mode: number
  /** Preserve the original index's racy-stat epoch when restoring its bytes. */
  readonly timestamps?: {
    readonly atimeMs: number
    readonly mtimeMs: number
  }
}

export interface IFrozenHunk {
  readonly id: string
  readonly start: number
  readonly end: number
  readonly replacement: Buffer
}

export interface IFrozenFile {
  readonly file: WorkingDirectoryFileChange
  readonly state: CapturedFileState
  readonly base: ITreeEntry | null
  readonly selected: ITreeEntry | null
  readonly baseBytes: Buffer
  readonly atomicId: string | null
  readonly hunks: ReadonlyArray<IFrozenHunk>
}

export interface IAssistedCommitData {
  readonly repository: Repository
  readonly snapshot: IAssistedCommitSnapshot
  readonly request: ICopilotAssistedCommitRequest
  readonly gitDirectory: string
  readonly indexPath: string
  readonly originalIndex: IIndexState
  readonly originalHeadBytes: Buffer
  readonly temporaryDirectory: string
  readonly environment: Record<string, string | undefined>
  readonly baseTree: string
  readonly zeroId: string
  readonly files: ReadonlyArray<IFrozenFile>
  phase: 'captured' | 'validating' | 'executing' | 'disposing'
}

export const snapshots = new WeakMap<
  IAssistedCommitSnapshot,
  IAssistedCommitData
>()
export const disposedSnapshots = new WeakSet<IAssistedCommitSnapshot>()
export const validatedPlans = new WeakMap<
  IValidatedAssistedCommitPlan,
  IAssistedCommitData
>()

export function getSnapshotData(
  snapshot: IAssistedCommitSnapshot
): IAssistedCommitData {
  const data = snapshots.get(snapshot)
  if (data === undefined) {
    throw new AssistedCommitError(
      'disposed',
      'Assisted commit snapshot is disposed or was not captured by Desktop'
    )
  }
  return data
}
