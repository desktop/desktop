import { updateConflictState } from '../../../../src/lib/stores/updates/changes-state'
import { createState, createStatus } from './changes-state-helper'

describe('updateConflictState', () => {
  const statsStore = {
    recordMergeAbortedAfterConflicts: jest.fn(),
    recordMergeSuccessAfterConflicts: jest.fn(),
  }

  it('returns null when no MERGE_HEAD file found', () => {
    const prevState = createState({ conflictState: null })
    const status = createStatus({ mergeHeadFound: false })
    const { conflictState } = updateConflictState(status, statsStore, prevState)
    expect(conflictState).toBeNull()
  })

  it('returns null when MERGE_HEAD set but not branch or tip defined', () => {
    const prevState = createState({ conflictState: null })
    const status = createStatus({
      mergeHeadFound: true,
      currentBranch: undefined,
      currentTip: undefined,
    })

    const { conflictState } = updateConflictState(status, statsStore, prevState)
    expect(conflictState).toBeNull()
  })

  it('returns a value when status has MERGE_HEAD set', () => {
    const prevState = createState({
      conflictState: null,
    })
    const status = createStatus({
      mergeHeadFound: true,
      currentBranch: 'master',
      currentTip: 'first-sha',
    })

    const { conflictState } = updateConflictState(status, statsStore, prevState)

    expect(conflictState).toEqual({
      currentBranch: 'master',
      currentTip: 'first-sha',
    })
  })

  it('increments abort counter when branch has changed', () => {
    const prevState = createState({
      conflictState: {
        currentBranch: 'old-branch',
        currentTip: 'old-sha',
      },
    })
    const status = createStatus({
      mergeHeadFound: true,
      currentBranch: 'master',
      currentTip: 'first-sha',
    })

    updateConflictState(status, statsStore, prevState)

    expect(statsStore.recordMergeAbortedAfterConflicts).toHaveBeenCalled()
  })

  it('increments abort counter when conflict resolved and tip has not changed', () => {
    const prevState = createState({
      conflictState: {
        currentBranch: 'master',
        currentTip: 'old-sha',
      },
    })
    const status = createStatus({
      mergeHeadFound: false,
      currentBranch: 'master',
      currentTip: 'old-sha',
    })

    updateConflictState(status, statsStore, prevState)

    expect(statsStore.recordMergeAbortedAfterConflicts).toHaveBeenCalled()
  })

  it('increments success counter when conflict resolved and tip has changed', () => {
    const prevState = createState({
      conflictState: {
        currentBranch: 'master',
        currentTip: 'old-sha',
      },
    })
    const status = createStatus({
      mergeHeadFound: false,
      currentBranch: 'master',
      currentTip: 'new-sha',
    })

    updateConflictState(status, statsStore, prevState)

    expect(statsStore.recordMergeSuccessAfterConflicts).toHaveBeenCalled()
  })
})
