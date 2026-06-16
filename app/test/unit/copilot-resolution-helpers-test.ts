import { describe, it } from 'node:test'
import assert from 'node:assert'

import {
  getResolutionChoiceForFile,
  isDeleteModifyConflict,
  getDefaultDeleteModifyChoice,
  choiceToManualResolution,
} from '../../src/ui/multi-commit-operation/dialog/copilot-resolution-helpers'
import { ManualConflictResolution } from '../../src/models/manual-conflict-resolution'
import {
  AppFileStatusKind,
  ConflictedFileStatus,
  GitStatusEntry,
  UnmergedEntrySummary,
} from '../../src/models/status'

function makeDeletedByThem(): ConflictedFileStatus {
  return {
    kind: AppFileStatusKind.Conflicted,
    entry: {
      kind: 'conflicted' as const,
      action: UnmergedEntrySummary.DeletedByThem,
      us: GitStatusEntry.UpdatedButUnmerged,
      them: GitStatusEntry.Deleted,
    },
  }
}

function makeDeletedByUs(): ConflictedFileStatus {
  return {
    kind: AppFileStatusKind.Conflicted,
    entry: {
      kind: 'conflicted' as const,
      action: UnmergedEntrySummary.DeletedByUs,
      us: GitStatusEntry.Deleted,
      them: GitStatusEntry.UpdatedButUnmerged,
    },
  }
}

function makeBothDeleted(): ConflictedFileStatus {
  return {
    kind: AppFileStatusKind.Conflicted,
    entry: {
      kind: 'conflicted' as const,
      action: UnmergedEntrySummary.BothDeleted,
      us: GitStatusEntry.Deleted,
      them: GitStatusEntry.Deleted,
    },
  }
}

function makeBothModified(): ConflictedFileStatus {
  return {
    kind: AppFileStatusKind.Conflicted,
    entry: {
      kind: 'conflicted' as const,
      action: UnmergedEntrySummary.BothModified,
      us: GitStatusEntry.UpdatedButUnmerged,
      them: GitStatusEntry.UpdatedButUnmerged,
    },
    conflictMarkerCount: 3,
  }
}

describe('copilot-resolution-helpers', () => {
  describe('isDeleteModifyConflict', () => {
    it('returns true for DeletedByThem', () => {
      assert.strictEqual(isDeleteModifyConflict(makeDeletedByThem()), true)
    })

    it('returns true for DeletedByUs', () => {
      assert.strictEqual(isDeleteModifyConflict(makeDeletedByUs()), true)
    })

    it('returns true for BothDeleted', () => {
      assert.strictEqual(isDeleteModifyConflict(makeBothDeleted()), true)
    })

    it('returns false for BothModified (text conflict)', () => {
      assert.strictEqual(isDeleteModifyConflict(makeBothModified()), false)
    })
  })

  describe('getDefaultDeleteModifyChoice', () => {
    it('defaults to ours for DeletedByThem (keep the modified file)', () => {
      assert.strictEqual(
        getDefaultDeleteModifyChoice(UnmergedEntrySummary.DeletedByThem),
        'ours'
      )
    })

    it('defaults to theirs for DeletedByUs (keep the modified file)', () => {
      assert.strictEqual(
        getDefaultDeleteModifyChoice(UnmergedEntrySummary.DeletedByUs),
        'theirs'
      )
    })

    it('defaults to ours for BothDeleted', () => {
      assert.strictEqual(
        getDefaultDeleteModifyChoice(UnmergedEntrySummary.BothDeleted),
        'ours'
      )
    })
  })

  describe('getResolutionChoiceForFile', () => {
    it('returns copilot by default for text conflicts', () => {
      const resolutions = new Map<string, ManualConflictResolution>()
      assert.strictEqual(
        getResolutionChoiceForFile('file.ts', resolutions),
        'copilot'
      )
    })

    it('returns ours when manual resolution is ours', () => {
      const resolutions = new Map<string, ManualConflictResolution>([
        ['file.ts', ManualConflictResolution.ours],
      ])
      assert.strictEqual(
        getResolutionChoiceForFile('file.ts', resolutions),
        'ours'
      )
    })

    it('returns theirs when manual resolution is theirs', () => {
      const resolutions = new Map<string, ManualConflictResolution>([
        ['file.ts', ManualConflictResolution.theirs],
      ])
      assert.strictEqual(
        getResolutionChoiceForFile('file.ts', resolutions),
        'theirs'
      )
    })

    it('returns ours by default for DeletedByThem (no manual override)', () => {
      const resolutions = new Map<string, ManualConflictResolution>()
      assert.strictEqual(
        getResolutionChoiceForFile('file.ts', resolutions, makeDeletedByThem()),
        'ours'
      )
    })

    it('returns theirs by default for DeletedByUs (no manual override)', () => {
      const resolutions = new Map<string, ManualConflictResolution>()
      assert.strictEqual(
        getResolutionChoiceForFile('file.ts', resolutions, makeDeletedByUs()),
        'theirs'
      )
    })

    it('respects manual override even for delete-vs-modify', () => {
      const resolutions = new Map<string, ManualConflictResolution>([
        ['file.ts', ManualConflictResolution.theirs],
      ])
      assert.strictEqual(
        getResolutionChoiceForFile('file.ts', resolutions, makeDeletedByThem()),
        'theirs'
      )
    })

    it('returns copilot for text conflicts even with status provided', () => {
      const resolutions = new Map<string, ManualConflictResolution>()
      assert.strictEqual(
        getResolutionChoiceForFile('file.ts', resolutions, makeBothModified()),
        'copilot'
      )
    })
  })

  describe('choiceToManualResolution', () => {
    it('maps copilot to null', () => {
      assert.strictEqual(choiceToManualResolution('copilot'), null)
    })

    it('maps ours to ManualConflictResolution.ours', () => {
      assert.strictEqual(
        choiceToManualResolution('ours'),
        ManualConflictResolution.ours
      )
    })

    it('maps theirs to ManualConflictResolution.theirs', () => {
      assert.strictEqual(
        choiceToManualResolution('theirs'),
        ManualConflictResolution.theirs
      )
    })
  })
})
