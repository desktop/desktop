import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  isIdMultiCommitOperation,
  MultiCommitOperationKind,
  MultiCommitOperationStepKind,
  conflictSteps,
} from '../../src/models/multi-commit-operation'
import {
  hasExternalRebaseConflictFlowEnded,
  isConflictsFlow,
  getMultiCommitOperationChooseBranchStep,
} from '../../src/lib/multi-commit-operation'
import { TipState } from '../../src/models/tip'

describe('multi-commit-operation', () => {
  describe('isIdMultiCommitOperation', () => {
    it('returns true for Rebase', () => {
      assert.equal(isIdMultiCommitOperation('Rebase'), true)
    })

    it('returns true for Cherry-pick', () => {
      assert.equal(isIdMultiCommitOperation('Cherry-pick'), true)
    })

    it('returns true for Squash', () => {
      assert.equal(isIdMultiCommitOperation('Squash'), true)
    })

    it('returns true for Merge', () => {
      assert.equal(isIdMultiCommitOperation('Merge'), true)
    })

    it('returns true for Reorder', () => {
      assert.equal(isIdMultiCommitOperation('Reorder'), true)
    })

    it('returns false for unknown operations', () => {
      assert.equal(isIdMultiCommitOperation('Unknown'), false)
      assert.equal(isIdMultiCommitOperation(''), false)
      assert.equal(isIdMultiCommitOperation('rebase'), false)
    })
  })

  describe('conflictSteps', () => {
    it('includes ShowConflicts', () => {
      assert.ok(
        conflictSteps.includes(MultiCommitOperationStepKind.ShowConflicts)
      )
    })

    it('includes ConfirmAbort', () => {
      assert.ok(
        conflictSteps.includes(MultiCommitOperationStepKind.ConfirmAbort)
      )
    })

    it('does not include ChooseBranch', () => {
      assert.equal(
        conflictSteps.includes(MultiCommitOperationStepKind.ChooseBranch),
        false
      )
    })
  })

  describe('isConflictsFlow', () => {
    it('returns false when popup is not open', () => {
      assert.equal(isConflictsFlow(false, null), false)
    })

    it('returns false when state is null', () => {
      assert.equal(isConflictsFlow(true, null), false)
    })

    it('returns false when step is not a conflict step', () => {
      const state = {
        step: { kind: MultiCommitOperationStepKind.ShowProgress },
        operationDetail: { kind: MultiCommitOperationKind.Rebase },
        progress: { kind: 'multiCommitOperation' as const, value: 0 },
        userHasResolvedConflicts: false,
      } as any

      assert.equal(isConflictsFlow(true, state), false)
    })

    it('returns true when in ShowConflicts step', () => {
      const state = {
        step: { kind: MultiCommitOperationStepKind.ShowConflicts },
        operationDetail: { kind: MultiCommitOperationKind.Rebase },
        progress: { kind: 'multiCommitOperation' as const, value: 0 },
        userHasResolvedConflicts: false,
      } as any

      assert.equal(isConflictsFlow(true, state), true)
    })

    it('returns true when in ConfirmAbort step', () => {
      const state = {
        step: { kind: MultiCommitOperationStepKind.ConfirmAbort },
        operationDetail: { kind: MultiCommitOperationKind.CherryPick },
        progress: { kind: 'multiCommitOperation' as const, value: 0 },
        userHasResolvedConflicts: true,
      } as any

      assert.equal(isConflictsFlow(true, state), true)
    })
  })

  describe('hasExternalRebaseConflictFlowEnded', () => {
    const createOperationState = (
      operationKind: MultiCommitOperationKind,
      stepKind: MultiCommitOperationStepKind
    ) =>
      ({
        step: { kind: stepKind },
        operationDetail: { kind: operationKind },
      } as any)

    it('returns true when an externally completed rebase was showing conflicts', () => {
      const state = createOperationState(
        MultiCommitOperationKind.Rebase,
        MultiCommitOperationStepKind.ShowConflicts
      )

      assert.equal(hasExternalRebaseConflictFlowEnded(null, state), true)
    })

    it('returns true when an externally completed reorder had hidden conflicts', () => {
      const state = createOperationState(
        MultiCommitOperationKind.Reorder,
        MultiCommitOperationStepKind.HideConflicts
      )

      assert.equal(hasExternalRebaseConflictFlowEnded(null, state), true)
    })

    it('returns false while rebase metadata still produces a conflict state', () => {
      const state = createOperationState(
        MultiCommitOperationKind.Rebase,
        MultiCommitOperationStepKind.ShowConflicts
      )
      const conflictState = {
        kind: 'rebase',
        currentTip: 'current-tip',
        targetBranch: 'feature',
        originalBranchTip: 'original-tip',
        baseBranchTip: 'base-tip',
        manualResolutions: new Map(),
      } as any

      assert.equal(
        hasExternalRebaseConflictFlowEnded(conflictState, state),
        false
      )
    })

    it('returns false for an internally continuing rebase', () => {
      const state = createOperationState(
        MultiCommitOperationKind.Rebase,
        MultiCommitOperationStepKind.ShowProgress
      )

      assert.equal(hasExternalRebaseConflictFlowEnded(null, state), false)
    })

    it('returns false for a squash merge awaiting its merge commit', () => {
      const state = createOperationState(
        MultiCommitOperationKind.Merge,
        MultiCommitOperationStepKind.ShowConflicts
      )

      assert.equal(hasExternalRebaseConflictFlowEnded(null, state), false)
    })
  })

  describe('getMultiCommitOperationChooseBranchStep', () => {
    it('throws when tip is not valid', () => {
      const state = {
        branchesState: {
          tip: { kind: TipState.Unknown },
          defaultBranch: null,
          allBranches: [],
          recentBranches: [],
        },
      } as any

      assert.throws(() => {
        getMultiCommitOperationChooseBranchStep(state)
      })
    })

    it('returns ChooseBranch step with branch info when tip is valid', () => {
      const currentBranch = {
        name: 'feature',
        tip: { sha: 'abc123' },
        type: 0,
      }
      const defaultBranch = {
        name: 'main',
        tip: { sha: 'def456' },
        type: 0,
      }

      const state = {
        branchesState: {
          tip: { kind: TipState.Valid, branch: currentBranch },
          defaultBranch,
          allBranches: [currentBranch, defaultBranch],
          recentBranches: [currentBranch],
        },
      } as any

      const step = getMultiCommitOperationChooseBranchStep(state)

      assert.equal(step.kind, MultiCommitOperationStepKind.ChooseBranch)
      assert.equal(step.currentBranch, currentBranch)
      assert.equal(step.defaultBranch, defaultBranch)
      assert.equal(step.allBranches.length, 2)
    })
  })
})
