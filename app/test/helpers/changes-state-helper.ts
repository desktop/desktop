import { IChangesState, ChangesSelectionKind } from '../../src/lib/app-state'
import { WorkingDirectoryStatus } from '../../src/models/status'
import { merge } from '../../src/lib/merge'
import { IStatusResult } from '../../src/lib/git'
import { DefaultCommitMessage } from '../../src/models/commit-message'
import { RepoRulesInfo } from '../../src/models/repo-rules'

export function createState<K extends keyof IChangesState>(
  pick: Pick<IChangesState, K>
): IChangesState {
  const baseChangesState: IChangesState = {
    workingDirectory: WorkingDirectoryStatus.fromFiles([]),
    selection: {
      kind: ChangesSelectionKind.WorkingDirectory,
      selectedFileIDs: [],
      diff: null,
    },
    commitMessage: DefaultCommitMessage,
    showCoAuthoredBy: false,
    coAuthors: [],
    conflictState: null,
    stashEntry: null,
    currentBranchProtected: false,
    currentRepoRulesInfo: new RepoRulesInfo(),
  }

  return merge(baseChangesState, pick)
}

export function createStatus<K extends keyof IStatusResult>(
  pick: Pick<IStatusResult, K>
): IStatusResult {
  const baseStatus: IStatusResult = {
    exists: true,
    mergeHeadFound: false,
    squashMsgFound: false,
    rebaseInternalState: null,
    isCherryPickingHeadFound: false,
    workingDirectory: WorkingDirectoryStatus.fromFiles([]),
    doConflictedFilesExist: false,
  }

  return merge(baseStatus, pick)
}
