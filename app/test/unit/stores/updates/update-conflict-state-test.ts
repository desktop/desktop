import { updateConflictState } from '../../../../src/lib/stores/updates/changes-state'
import {
  createState,
  createStatus,
} from '../../../helpers/changes-state-helper'
import { ManualConflictResolution } from '../../../../src/models/manual-conflict-resolution'
import { IStatsStore } from '../../../../src/lib/stats'

describe('updateConflictState', () => {
  let statsStore: IStatsStore
  beforeEach(() => {
    statsStore = { increment: jest.fn() }
  })

  const manualResolutions = new Map<string, ManualConflictResolution>([
    ['foo', ManualConflictResolution.theirs],
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
        doConflictedFilesExist: true,
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

    it('returns a value when status has MERGE_HEAD set and in conflicted state', () => {
      const prevState = createState({
        conflictState: null,
      })
      const status = createStatus({
        mergeHeadFound: true,
        currentBranch: 'master',
        currentTip: 'first-sha',
        doConflictedFilesExist: true,
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
        doConflictedFilesExist: true,
      })

      updateConflictState(prevState, status, statsStore)

      expect(statsStore.increment).toHaveBeenCalledWith(
        'mergeAbortedAfterConflictsCount'
      )
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

      expect(statsStore.increment).toHaveBeenCalledWith(
        'mergeAbortedAfterConflictsCount'
      )
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

      expect(statsStore.increment).toHaveBeenCalledWith(
        'mergeSuccessAfterConflictsCount'
      )
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
          baseBranchTip: 'another-sha',
          originalBranchTip: 'some-other-sha',
        },
      })
      const status = createStatus({ rebaseInternalState: null })
      const conflictState = updateConflictState(prevState, status, statsStore)
      expect(conflictState).toBeNull()
    })

    it('returns a value when status has REBASE_HEAD set and conflict present', () => {
      const prevState = createState({
        conflictState: null,
      })
      const status = createStatus({
        rebaseInternalState: {
          targetBranch: 'my-feature-branch',
          baseBranchTip: 'another-sha',
          originalBranchTip: 'some-other-sha',
        },
        currentBranch: 'master',
        currentTip: 'first-sha',
        doConflictedFilesExist: true,
      })

      const conflictState = updateConflictState(prevState, status, statsStore)

      expect(conflictState).toEqual({
        kind: 'rebase',
        currentTip: 'first-sha',
        manualResolutions: new Map<string, ManualConflictResolution>(),
        baseBranchTip: 'another-sha',
        targetBranch: 'my-feature-branch',
        originalBranchTip: 'some-other-sha',
      })
    })

    it('preserves manual resolutions when a rebase is detected', () => {
      const prevState = createState({
        conflictState: {
          kind: 'rebase',
          currentTip: 'old-sha',
          manualResolutions,
          targetBranch: 'my-feature-branch',
          baseBranchTip: 'another-sha',
          originalBranchTip: 'some-other-sha',
        },
      })
      const status = createStatus({
        rebaseInternalState: {
          targetBranch: 'my-feature-branch',
          baseBranchTip: 'another-sha',
          originalBranchTip: 'some-other-sha',
        },
        currentBranch: 'master',
        currentTip: 'first-sha',
        doConflictedFilesExist: true,
      })

      const conflictState = updateConflictState(prevState, status, statsStore)

      expect(conflictState).toEqual({
        kind: 'rebase',
        currentTip: 'first-sha',
        manualResolutions,
        targetBranch: 'my-feature-branch',
        baseBranchTip: 'another-sha',
        originalBranchTip: 'some-other-sha',
      })
    })

    it('increments abort counter when conflict remains but branch has changed', () => {
      const prevState = createState({
        conflictState: {
          kind: 'rebase',
          currentTip: 'current-sha',
          manualResolutions,
          targetBranch: 'my-feature-branch',
          baseBranchTip: 'another-sha',
          originalBranchTip: 'old-sha',
        },
      })
      const status = createStatus({
        rebaseInternalState: {
          targetBranch: 'a-different-feature-branch',
          originalBranchTip: 'some-old-sha',
          baseBranchTip: 'an-even-older-sha',
        },
        currentTip: 'current-sha',
        doConflictedFilesExist: true,
      })

      updateConflictState(prevState, status, statsStore)

      expect(statsStore.increment).toHaveBeenCalledWith(
        'rebaseAbortedAfterConflictsCount'
      )
    })

    it('increments abort counter when conflict resolved but tip has not changed', () => {
      const prevState = createState({
        conflictState: {
          kind: 'rebase',
          currentTip: 'current-sha',
          manualResolutions,
          targetBranch: 'my-feature-branch',
          baseBranchTip: 'another-sha',
          originalBranchTip: 'old-sha',
        },
      })
      const status = createStatus({
        rebaseInternalState: null,
        currentBranch: 'my-feature-branch',
        currentTip: 'old-sha',
      })

      updateConflictState(prevState, status, statsStore)

      expect(statsStore.increment).toHaveBeenCalledWith(
        'rebaseAbortedAfterConflictsCount'
      )
    })

    it('does not increment aborted counter when conflict resolved and tip has changed', () => {
      const prevState = createState({
        conflictState: {
          kind: 'rebase',
          currentTip: 'current-sha',
          manualResolutions,
          targetBranch: 'my-feature-branch',
          baseBranchTip: 'even-older-sha',
          originalBranchTip: 'old-sha',
        },
      })
      const status = createStatus({
        rebaseInternalState: null,
        currentBranch: 'my-feature-branch',
        currentTip: 'new-sha',
      })

      updateConflictState(prevState, status, statsStore)

      expect(statsStore.increment).not.toHaveBeenCalledWith(
        'rebaseAbortedAfterConflictsCount'
      )
    })
  })
})
