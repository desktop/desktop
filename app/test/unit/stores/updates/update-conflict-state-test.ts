import { updateConflictState } from '../../../../src/lib/stores/updates/changes-state'
import { createState, createStatus } from './changes-state-helper'
import {
  ManualConflictResolution,
  ManualConflictResolutionKind,
} from '../../../../src/models/manual-conflict-resolution'

describe('updateConflictState', () => {
  const statsStore = {
    recordMergeAbortedAfterConflicts: jest.fn(),
    recordMergeSuccessAfterConflicts: jest.fn(),
  }
  const manualResolutions = new Map<string, ManualConflictResolution>([
    ['foo', ManualConflictResolutionKind.theirs],
  ])

  describe('merge conflicts', () => {
    it('returns null when no MERGE_HEAD file found', () => {
      const prevState = createState({
        conflictState: {
          kind: 'merge',
          currentBranch: 'old-branch',
          currentTip: 'old-sha',
          manualResolutions,
        },
      })
      const status = createStatus({ mergeHeadFound: false })
      const conflictState = updateConflictState(prevState, status, statsStore)
      expect(conflictState).toBeNull()
    })

    it('preserves manual resolutions between updates in the same merge', () => {
      const prevState = createState({
        conflictState: {
          kind: 'merge',
          currentBranch: 'old-branch',
          currentTip: 'old-sha',
          manualResolutions,
        },
      })
      const status = createStatus({
        mergeHeadFound: true,
        currentBranch: 'master',
        currentTip: 'first-sha',
      })

      const conflictState = updateConflictState(prevState, status, statsStore)

      expect(conflictState).toEqual({
        kind: 'merge',
        currentBranch: 'master',
        currentTip: 'first-sha',
        manualResolutions,
      })
    })

    it('returns null when MERGE_HEAD set but not branch or tip defined', () => {
      const prevState = createState({
        conflictState: {
          kind: 'merge',
          currentBranch: 'old-branch',
          currentTip: 'old-sha',
          manualResolutions,
        },
      })
      const status = createStatus({
        mergeHeadFound: true,
        currentBranch: undefined,
        currentTip: undefined,
      })

      const conflictState = updateConflictState(prevState, status, statsStore)
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

      const conflictState = updateConflictState(prevState, status, statsStore)

      expect(conflictState).toEqual({
        kind: 'merge',
        currentBranch: 'master',
        currentTip: 'first-sha',
        manualResolutions: new Map<string, ManualConflictResolution>(),
      })
    })

    it('increments abort counter when branch has changed', () => {
      const prevState = createState({
        conflictState: {
          kind: 'merge',
          currentBranch: 'old-branch',
          currentTip: 'old-sha',
          manualResolutions: new Map<string, ManualConflictResolution>(),
        },
      })
      const status = createStatus({
        mergeHeadFound: true,
        currentBranch: 'master',
        currentTip: 'first-sha',
      })

      updateConflictState(prevState, status, statsStore)

      expect(statsStore.recordMergeAbortedAfterConflicts).toHaveBeenCalled()
    })

    it('increments abort counter when conflict resolved and tip has not changed', () => {
      const prevState = createState({
        conflictState: {
          kind: 'merge',
          currentBranch: 'master',
          currentTip: 'old-sha',
          manualResolutions: new Map<string, ManualConflictResolution>(),
        },
      })
      const status = createStatus({
        mergeHeadFound: false,
        currentBranch: 'master',
        currentTip: 'old-sha',
      })

      updateConflictState(prevState, status, statsStore)

      expect(statsStore.recordMergeAbortedAfterConflicts).toHaveBeenCalled()
    })

    it('increments success counter when conflict resolved and tip has changed', () => {
      const prevState = createState({
        conflictState: {
          kind: 'merge',
          currentBranch: 'master',
          currentTip: 'old-sha',
          manualResolutions: new Map<string, ManualConflictResolution>(),
        },
      })
      const status = createStatus({
        mergeHeadFound: false,
        currentBranch: 'master',
        currentTip: 'new-sha',
      })

      updateConflictState(prevState, status, statsStore)

      expect(statsStore.recordMergeSuccessAfterConflicts).toHaveBeenCalled()
    })
  })

  describe('rebase conflicts', () => {
    it('returns null when no REBASE_HEAD file found', () => {
      const prevState = createState({
        conflictState: {
          kind: 'rebase',
          currentTip: 'old-sha',
          manualResolutions,
          targetBranch: 'my-feature-branch',
          originalBranchTip: 'some-other-sha',
        },
      })
      const status = createStatus({ rebaseHeadFound: false })
      const conflictState = updateConflictState(prevState, status, statsStore)
      expect(conflictState).toBeNull()
    })

    it('returns a value when status has REBASE_HEAD set', () => {
      const prevState = createState({
        conflictState: null,
      })
      const status = createStatus({
        rebaseHeadFound: true,
        currentBranch: 'master',
        currentTip: 'first-sha',
      })

      const conflictState = updateConflictState(prevState, status, statsStore)

      expect(conflictState).toEqual({
        kind: 'rebase',
        currentTip: 'first-sha',
        manualResolutions: new Map<string, ManualConflictResolution>(),
      })
    })

    it('preserves manual resolutions when a rebase is detected', () => {
      const prevState = createState({
        conflictState: {
          kind: 'rebase',
          currentTip: 'old-sha',
          manualResolutions,
          targetBranch: 'my-feature-branch',
          originalBranchTip: 'some-other-sha',
        },
      })
      const status = createStatus({
        rebaseHeadFound: true,
        currentBranch: 'master',
        currentTip: 'first-sha',
      })

      const conflictState = updateConflictState(prevState, status, statsStore)

      expect(conflictState).toEqual({
        kind: 'rebase',
        currentTip: 'first-sha',
        manualResolutions,
      })
    })
  })
})
