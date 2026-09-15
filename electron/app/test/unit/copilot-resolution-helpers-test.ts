import { describe, it } from 'node:test'
import assert from 'node:assert'

import {
  isDeleteConflictFile,
  getDeletedSide,
  getDeleteConflictLabels,
  getDeleteConflictChoiceLabel,
  getOursTheirsLabels,
} from '../../src/ui/multi-commit-operation/dialog/copilot-resolution-helpers'
import {
  AppFileStatusKind,
  GitStatusEntry,
  ManualConflict,
  ConflictedFileStatus,
  UnmergedEntrySummary,
} from '../../src/models/status'

// ---------------------------------------------------------------------------
// Helpers for creating conflict status objects
// ---------------------------------------------------------------------------

function makeDeletedByUs(): ManualConflict {
  return {
    kind: AppFileStatusKind.Conflicted,
    entry: {
      kind: 'conflicted',
      action: UnmergedEntrySummary.DeletedByUs,
      us: GitStatusEntry.Deleted,
      them: GitStatusEntry.UpdatedButUnmerged,
    },
  }
}

function makeDeletedByThem(): ManualConflict {
  return {
    kind: AppFileStatusKind.Conflicted,
    entry: {
      kind: 'conflicted',
      action: UnmergedEntrySummary.DeletedByThem,
      us: GitStatusEntry.UpdatedButUnmerged,
      them: GitStatusEntry.Deleted,
    },
  }
}

function makeBothDeleted(): ManualConflict {
  return {
    kind: AppFileStatusKind.Conflicted,
    entry: {
      kind: 'conflicted',
      action: UnmergedEntrySummary.BothDeleted,
      us: GitStatusEntry.Deleted,
      them: GitStatusEntry.Deleted,
    },
  }
}

function makeBothModified(): ManualConflict {
  return {
    kind: AppFileStatusKind.Conflicted,
    entry: {
      kind: 'conflicted',
      action: UnmergedEntrySummary.BothModified,
      us: GitStatusEntry.UpdatedButUnmerged,
      them: GitStatusEntry.UpdatedButUnmerged,
    },
  }
}

function makeBothAdded(): ManualConflict {
  return {
    kind: AppFileStatusKind.Conflicted,
    entry: {
      kind: 'conflicted',
      action: UnmergedEntrySummary.BothAdded,
      us: GitStatusEntry.Added,
      them: GitStatusEntry.Added,
    },
  }
}

function makeConflictWithMarkers(): ConflictedFileStatus {
  return {
    kind: AppFileStatusKind.Conflicted,
    entry: {
      kind: 'conflicted',
      action: UnmergedEntrySummary.BothModified,
      us: GitStatusEntry.UpdatedButUnmerged,
      them: GitStatusEntry.UpdatedButUnmerged,
    },
    conflictMarkerCount: 3,
  }
}

// ---------------------------------------------------------------------------
// isDeleteConflictFile
// ---------------------------------------------------------------------------

describe('isDeleteConflictFile', () => {
  it('returns true when "us" is deleted and "them" is not', () => {
    assert.equal(isDeleteConflictFile(makeDeletedByUs()), true)
  })

  it('returns true when "them" is deleted and "us" is not', () => {
    assert.equal(isDeleteConflictFile(makeDeletedByThem()), true)
  })

  it('returns false when both sides are deleted', () => {
    assert.equal(isDeleteConflictFile(makeBothDeleted()), false)
  })

  it('returns false when neither side is deleted', () => {
    assert.equal(isDeleteConflictFile(makeBothModified()), false)
  })

  it('returns false for ConflictsWithMarkers (text conflicts)', () => {
    assert.equal(isDeleteConflictFile(makeConflictWithMarkers()), false)
  })

  it('returns false for BothAdded manual conflict', () => {
    assert.equal(isDeleteConflictFile(makeBothAdded()), false)
  })
})

// ---------------------------------------------------------------------------
// getDeletedSide
// ---------------------------------------------------------------------------

describe('getDeletedSide', () => {
  it('returns "ours" when us is deleted', () => {
    assert.equal(getDeletedSide(makeDeletedByUs()), 'ours')
  })

  it('returns "theirs" when them is deleted', () => {
    assert.equal(getDeletedSide(makeDeletedByThem()), 'theirs')
  })

  it('returns undefined when neither side is deleted', () => {
    assert.equal(getDeletedSide(makeBothModified()), undefined)
  })
})

// ---------------------------------------------------------------------------
// getDeleteConflictLabels
// ---------------------------------------------------------------------------

describe('getDeleteConflictLabels', () => {
  it('labels correctly when ours deleted the file', () => {
    const { oursLabel, theirsLabel } = getDeleteConflictLabels(
      makeDeletedByUs(),
      'main',
      'feature'
    )
    assert.equal(oursLabel, 'Delete file on main')
    assert.equal(theirsLabel, 'Keep file from feature')
  })

  it('labels correctly when theirs deleted the file', () => {
    const { oursLabel, theirsLabel } = getDeleteConflictLabels(
      makeDeletedByThem(),
      'main',
      'feature'
    )
    assert.equal(oursLabel, 'Keep file from main')
    assert.equal(theirsLabel, 'Delete file on feature')
  })

  it('omits branch names when not provided', () => {
    const { oursLabel, theirsLabel } = getDeleteConflictLabels(
      makeDeletedByUs()
    )
    assert.equal(oursLabel, 'Delete file')
    assert.equal(theirsLabel, 'Keep file')
  })
})

// ---------------------------------------------------------------------------
// getDeleteConflictChoiceLabel
// ---------------------------------------------------------------------------

describe('getDeleteConflictChoiceLabel', () => {
  it('returns "Copilot" for the copilot choice', () => {
    assert.equal(
      getDeleteConflictChoiceLabel('copilot', makeDeletedByUs()),
      'Copilot'
    )
  })

  it('returns "Delete file" for ours when ours deleted', () => {
    assert.equal(
      getDeleteConflictChoiceLabel('ours', makeDeletedByUs()),
      'Delete file'
    )
  })

  it('returns "Keep file" for theirs when ours deleted', () => {
    assert.equal(
      getDeleteConflictChoiceLabel('theirs', makeDeletedByUs()),
      'Keep file'
    )
  })

  it('returns "Keep file" for ours when theirs deleted', () => {
    assert.equal(
      getDeleteConflictChoiceLabel('ours', makeDeletedByThem()),
      'Keep file'
    )
  })

  it('returns "Delete file" for theirs when theirs deleted', () => {
    assert.equal(
      getDeleteConflictChoiceLabel('theirs', makeDeletedByThem()),
      'Delete file'
    )
  })
})

// ---------------------------------------------------------------------------
// getOursTheirsLabels
// ---------------------------------------------------------------------------

describe('getOursTheirsLabels', () => {
  it('returns delete conflict labels for a delete-vs-modify file', () => {
    const { oursLabel, theirsLabel } = getOursTheirsLabels(
      makeDeletedByUs(),
      'main',
      'feature'
    )
    assert.equal(oursLabel, 'Delete file on main')
    assert.equal(theirsLabel, 'Keep file from feature')
  })

  it('returns text conflict labels for a non-delete conflict', () => {
    const { oursLabel, theirsLabel } = getOursTheirsLabels(
      makeConflictWithMarkers(),
      'main',
      'feature'
    )
    assert.equal(oursLabel, 'Use current file from main')
    assert.equal(theirsLabel, 'Use incoming file from feature')
  })

  it('returns text conflict labels when status is undefined', () => {
    const { oursLabel, theirsLabel } = getOursTheirsLabels(
      undefined,
      'main',
      'feature'
    )
    assert.equal(oursLabel, 'Use current file from main')
    assert.equal(theirsLabel, 'Use incoming file from feature')
  })

  it('omits branch names when not provided', () => {
    const { oursLabel, theirsLabel } = getOursTheirsLabels(undefined)
    assert.equal(oursLabel, 'Use current file')
    assert.equal(theirsLabel, 'Use incoming file')
  })
})
