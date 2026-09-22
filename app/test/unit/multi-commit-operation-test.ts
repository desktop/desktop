import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  isIdMultiCommitOperation,
  MultiCommitOperationKind,
  MultiCommitOperationStepKind,
  conflictSteps,
  MultiCommitOperationDetail,
} from '../../src/models/multi-commit-operation'
import {
  isConflictsFlow,
  getMultiCommitOperationChooseBranchStep,
  getRebaseOperationStateAction,
} from '../../src/lib/multi-commit-operation'
import { TipState } from '../../src/models/tip'
import { IMultiCommitOperationState } from '../../src/lib/app-state'
import { Commit, CommitOneLine } from '../../src/models/commit'
import { CommitIdentity } from '../../src/models/commit-identity'
import { Repository } from '../../src/models/repository'
import { createTestRepositoryStateCache } from '../helpers/app-store-test-harness'

function createCommit(sha: string, summary: string): CommitOneLine {
  return { sha, summary }
}

function createFullCommit(summary: string): Commit {
  const author = new CommitIdentity('A', 'a@example.com', new Date(0))
  return new Commit(
    summary.length.toString(16).padStart(40, '0'),
    summary.length.toString(16).padStart(7, '0'),
    summary,
    '',
    author,
    author,
    [],
    [],
    []
  )
}

function createMultiCommitOperationState(
  operationDetail: MultiCommitOperationDetail
): IMultiCommitOperationState {
  return {
    step: { kind: MultiCommitOperationStepKind.ShowProgress },
    operationDetail,
    progress: {
      kind: 'multiCommitOperation',
      currentCommitSummary: '',
      position: 1,
      totalCommitCount: 0,
      value: 0,
    },
    userHasResolvedConflicts: false,
    useCopilotConflictResolution: false,
    copilotResolutions: null,
    copilotSkippedFiles: null,
    copilotResolutionProgress: null,
    copilotResolutionSummary: null,
    copilotResolutionAbortController: null,
    copilotResolutionModel: null,
    originalBranchTip: null,
    targetBranch: null,
  }
}

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

  describe('getRebaseOperationStateAction', () => {
    it('returns restore when there is no operation in progress', () => {
      const action = getRebaseOperationStateAction(null)

      assert.equal(action.kind, 'restore')
    })

    it('returns proceed with the commits of an in-progress rebase', () => {
      const commits = [
        createCommit('abc123', 'first'),
        createCommit('def456', 'second'),
      ]
      const state = createMultiCommitOperationState({
        kind: MultiCommitOperationKind.Rebase,
        commits,
        currentTip: 'base-tip',
        sourceBranch: null,
      })

      const action = getRebaseOperationStateAction(state)

      assert.equal(action.kind, 'proceed')
      assert.deepStrictEqual(
        action.kind === 'proceed' ? action.commits : null,
        commits
      )
    })

    it('returns proceed when the in-progress rebase has no commits', () => {
      const state = createMultiCommitOperationState({
        kind: MultiCommitOperationKind.Rebase,
        commits: [],
        currentTip: 'base-tip',
        sourceBranch: null,
      })

      const action = getRebaseOperationStateAction(state)

      assert.equal(action.kind, 'proceed')
      assert.deepStrictEqual(
        action.kind === 'proceed' ? action.commits : null,
        []
      )
    })

    it('returns abort when a merge is in progress', () => {
      const state = createMultiCommitOperationState({
        kind: MultiCommitOperationKind.Merge,
        isSquash: false,
        sourceBranch: null,
      })

      assert.equal(getRebaseOperationStateAction(state).kind, 'abort')
    })

    it('returns abort when a cherry-pick is in progress', () => {
      const state = createMultiCommitOperationState({
        kind: MultiCommitOperationKind.CherryPick,
        sourceBranch: null,
        branchCreated: false,
        commits: [createCommit('abc123', 'first')],
      })

      assert.equal(getRebaseOperationStateAction(state).kind, 'abort')
    })

    it('returns abort when a reorder is in progress', () => {
      const state = createMultiCommitOperationState({
        kind: MultiCommitOperationKind.Reorder,
        commits: [],
        currentTip: 'base-tip',
        lastRetainedCommitRef: null,
        beforeCommit: null,
      })

      assert.equal(getRebaseOperationStateAction(state).kind, 'abort')
    })

    it('returns abort when a squash is in progress', () => {
      const targetCommit = createFullCommit('target')
      const state = createMultiCommitOperationState({
        kind: MultiCommitOperationKind.Squash,
        commits: [createFullCommit('to squash')],
        currentTip: 'base-tip',
        lastRetainedCommitRef: null,
        targetCommit,
        commitContext: {
          summary: 'squashed',
          description: null,
          amend: false,
        },
      })

      assert.equal(getRebaseOperationStateAction(state).kind, 'abort')
    })
  })

  describe('rebase state lifecycle', () => {
    /**
     * Reproduces the lifecycle behind desktop/desktop#21904 against the real
     * state container: a rebase blocked by uncommitted local changes ends the
     * multi commit operation, and the retry that follows the user stashing
     * those changes has to rebuild the state instead of silently doing
     * nothing.
     */
    function createRebaseState(commits: ReadonlyArray<CommitOneLine>) {
      return createMultiCommitOperationState({
        kind: MultiCommitOperationKind.Rebase,
        commits,
        currentTip: 'base-tip',
        sourceBranch: null,
      })
    }

    it('asks for a restore once a failed rebase has cleared the state', () => {
      const repository = new Repository('/tmp/repo', 1, null, false)
      const cache = createTestRepositoryStateCache()
      const commits = [createCommit('abc123', 'feature one')]

      // The rebase starts and the operation is tracked.
      cache.initializeMultiCommitOperationState(
        repository,
        createRebaseState(commits)
      )

      assert.equal(
        getRebaseOperationStateAction(
          cache.get(repository).multiCommitOperationState
        ).kind,
        'proceed'
      )

      // Git refuses the rebase because of local changes, so `Dispatcher.rebase`
      // ends the operation before the error is surfaced to the user.
      cache.clearMultiCommitOperationState(repository)

      // The user stashes and the rebase is retried. Before the fix this state
      // made `Dispatcher.rebase` return without doing anything.
      assert.equal(
        getRebaseOperationStateAction(
          cache.get(repository).multiCommitOperationState
        ).kind,
        'restore'
      )
    })

    it('proceeds with the restored commits once the state is rebuilt', () => {
      const repository = new Repository('/tmp/repo', 1, null, false)
      const cache = createTestRepositoryStateCache()
      const commits = [
        createCommit('abc123', 'feature one'),
        createCommit('def456', 'feature two'),
      ]

      cache.clearMultiCommitOperationState(repository)

      // This mirrors what `restoreRebaseOperationState` rebuilds before
      // retrying the rebase.
      cache.initializeMultiCommitOperationState(
        repository,
        createRebaseState(commits)
      )

      const action = getRebaseOperationStateAction(
        cache.get(repository).multiCommitOperationState
      )

      assert.equal(action.kind, 'proceed')
      assert.deepStrictEqual(
        action.kind === 'proceed' ? action.commits : null,
        commits
      )
    })
  })
})
