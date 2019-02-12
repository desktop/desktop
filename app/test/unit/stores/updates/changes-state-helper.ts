import { IChangesState } from '../../../../src/lib/app-state'
import { WorkingDirectoryStatus } from '../../../../src/models/status'
import { merge } from '../../../../src/lib/merge'
import { IStatusResult } from '../../../../src/lib/git'
import { DefaultCommitMessage } from '../../../../src/models/commit-message'

export function createState<K extends keyof IChangesState>(
  pick: Pick<IChangesState, K>
): IChangesState {
  const baseChangesState: IChangesState = {
    workingDirectory: WorkingDirectoryStatus.fromFiles([]),
    selectedFileIDs: [],
    diff: null,
    commitMessage: DefaultCommitMessage,
    showCoAuthoredBy: false,
    coAuthors: [],
    conflictState: null,
  }

  return merge(baseChangesState, pick)
}

export function createStatus<K extends keyof IStatusResult>(
  pick: Pick<IStatusResult, K>
): IStatusResult {
  const baseStatus: IStatusResult = {
    exists: true,
    mergeHeadFound: false,
    rebaseHeadFound: false,
    workingDirectory: WorkingDirectoryStatus.fromFiles([]),
  }

  return merge(baseStatus, pick)
}
