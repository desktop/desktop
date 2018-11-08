import { updateConflictState } from '../../../../src/lib/stores/updates/changes-state'
import { IStatusResult } from '../../../../src/lib/git'
import { IChangesState } from '../../../../src/lib/app-state'
import { WorkingDirectoryStatus } from '../../../../src/models/status'

const baseChangesState: IChangesState = {
  workingDirectory: WorkingDirectoryStatus.fromFiles([]),
  selectedFileIDs: [],
  diff: null,
  commitMessage: null,
  showCoAuthoredBy: false,
  coAuthors: [],
  conflictState: null,
}

const baseStatus: IStatusResult = {
  exists: true,
  mergeHeadFound: false,
  workingDirectory: WorkingDirectoryStatus.fromFiles([]),
}

describe('updateConflictState', () => {
  const statsStore = {
    recordMergeAbortedAfterConflicts: jest.fn(),
    recordMergeSuccessAfterConflicts: jest.fn(),
  }

  it('returns null when no MERGE_HEAD file found', () => {
    const prevState = { ...baseChangesState, conflictState: null }
    const status = { ...baseStatus, mergeHeadFound: false }
    const { conflictState } = updateConflictState(status, statsStore, prevState)
    expect(conflictState).toBeNull()
  })

  it('returns null when MERGE_HEAD set but not branch or tip defined', () => {
    const prevState = { ...baseChangesState, conflictState: null }
    const status = {
      ...baseStatus,
      mergeHeadFound: true,
      currentBranch: undefined,
      currentTip: undefined,
    }
    const { conflictState } = updateConflictState(status, statsStore, prevState)
    expect(conflictState).toBeNull()
  })

  it('returns a value when status has MERGE_HEAD set', () => {
    const prevState = {
      ...baseChangesState,
      conflictState: null,
    }
    const status = {
      ...baseStatus,
      mergeHeadFound: true,
      currentBranch: 'master',
      currentTip: 'first-sha',
    }

    const { conflictState } = updateConflictState(status, statsStore, prevState)

    expect(conflictState).toEqual({
      currentBranch: 'master',
      currentTip: 'first-sha',
    })
  })

  it('increments abort counter when branch has changed', () => {
    const prevState = {
      ...baseChangesState,
      conflictState: {
        currentBranch: 'old-branch',
        currentTip: 'old-sha',
      },
    }
    const status = {
      ...baseStatus,
      mergeHeadFound: true,
      currentBranch: 'master',
      currentTip: 'first-sha',
    }

    updateConflictState(status, statsStore, prevState)

    expect(statsStore.recordMergeAbortedAfterConflicts).toHaveBeenCalled()
  })

  it('increments abort counter when conflict resolved and tip has not changed', () => {
    const prevState = {
      ...baseChangesState,
      conflictState: {
        currentBranch: 'master',
        currentTip: 'old-sha',
      },
    }
    const status = {
      ...baseStatus,
      mergeHeadFound: false,
      currentBranch: 'master',
      currentTip: 'old-sha',
    }

    updateConflictState(status, statsStore, prevState)

    expect(statsStore.recordMergeAbortedAfterConflicts).toHaveBeenCalled()
  })

  it('increments success counter when conflict resolved and tip has changed', () => {
    const prevState = {
      ...baseChangesState,
      conflictState: {
        currentBranch: 'master',
        currentTip: 'old-sha',
      },
    }
    const status = {
      ...baseStatus,
      mergeHeadFound: false,
      currentBranch: 'master',
      currentTip: 'new-sha',
    }

    updateConflictState(status, statsStore, prevState)

    expect(statsStore.recordMergeSuccessAfterConflicts).toHaveBeenCalled()
  })
})
