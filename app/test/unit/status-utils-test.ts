import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  mapStatus,
  isConflictedFile,
  hasConflictedFiles,
  getUnresolvedConflictFiles,
  hasUnresolvedConflictFiles,
} from '../../src/lib/status'
import {
  AppFileStatusKind,
  WorkingDirectoryStatus,
  WorkingDirectoryFileChange,
  GitStatusEntry,
} from '../../src/models/status'
import { DiffSelection, DiffSelectionType } from '../../src/models/diff'

function makeFile(
  path: string,
  kind: AppFileStatusKind
): WorkingDirectoryFileChange {
  const status =
    kind === AppFileStatusKind.Conflicted
      ? {
          kind: kind as AppFileStatusKind.Conflicted,
          entry: {
            kind: 'conflicted' as const,
            action: 'both-modified' as any,
            us: GitStatusEntry.UpdatedButUnmerged,
            them: GitStatusEntry.UpdatedButUnmerged,
          },
          conflictMarkerCount: 1,
        }
      : { kind }

  return new WorkingDirectoryFileChange(
    path,
    status as any,
    DiffSelection.fromInitialSelection(DiffSelectionType.All)
  )
}

describe('lib/status', () => {
  describe('mapStatus', () => {
    it('returns "New" for new files', () => {
      assert.equal(mapStatus({ kind: AppFileStatusKind.New }), 'New')
    })

    it('returns "New" for untracked files', () => {
      assert.equal(mapStatus({ kind: AppFileStatusKind.Untracked }), 'New')
    })

    it('returns "Modified" for modified files', () => {
      assert.equal(mapStatus({ kind: AppFileStatusKind.Modified }), 'Modified')
    })

    it('returns "Deleted" for deleted files', () => {
      assert.equal(mapStatus({ kind: AppFileStatusKind.Deleted }), 'Deleted')
    })

    it('returns "Renamed" for renamed files', () => {
      assert.equal(
        mapStatus({
          kind: AppFileStatusKind.Renamed,
          oldPath: 'old.txt',
          renameIncludesModifications: false,
        }),
        'Renamed'
      )
    })

    it('returns "Copied" for copied files', () => {
      assert.equal(
        mapStatus({
          kind: AppFileStatusKind.Copied,
          oldPath: 'orig.txt',
          renameIncludesModifications: false,
        }),
        'Copied'
      )
    })
  })

  describe('isConflictedFile', () => {
    it('returns true for conflicted files', () => {
      const status = {
        kind: AppFileStatusKind.Conflicted,
        entry: {
          kind: 'conflicted' as const,
          action: 'both-modified' as any,
          us: GitStatusEntry.UpdatedButUnmerged,
          them: GitStatusEntry.UpdatedButUnmerged,
        },
        conflictMarkerCount: 1,
      }
      assert.equal(isConflictedFile(status as any), true)
    })

    it('returns false for non-conflicted files', () => {
      assert.equal(
        isConflictedFile({ kind: AppFileStatusKind.Modified }),
        false
      )
      assert.equal(isConflictedFile({ kind: AppFileStatusKind.New }), false)
      assert.equal(isConflictedFile({ kind: AppFileStatusKind.Deleted }), false)
    })
  })

  describe('hasConflictedFiles', () => {
    it('returns false for an empty working directory', () => {
      const wd = WorkingDirectoryStatus.fromFiles([])
      assert.equal(hasConflictedFiles(wd), false)
    })

    it('returns false when no files are conflicted', () => {
      const files = [
        makeFile('a.txt', AppFileStatusKind.Modified),
        makeFile('b.txt', AppFileStatusKind.New),
      ]
      const wd = WorkingDirectoryStatus.fromFiles(files)
      assert.equal(hasConflictedFiles(wd), false)
    })

    it('returns true when a file is conflicted', () => {
      const files = [
        makeFile('a.txt', AppFileStatusKind.Modified),
        makeFile('b.txt', AppFileStatusKind.Conflicted),
      ]
      const wd = WorkingDirectoryStatus.fromFiles(files)
      assert.equal(hasConflictedFiles(wd), true)
    })
  })

  describe('getUnresolvedConflictFiles', () => {
    it('returns conflicted files with conflict markers', () => {
      const files = [
        makeFile('a.txt', AppFileStatusKind.Modified),
        makeFile('b.txt', AppFileStatusKind.Conflicted),
      ]
      const wd = WorkingDirectoryStatus.fromFiles(files)

      assert.deepEqual(
        getUnresolvedConflictFiles(wd).map(f => f.path),
        ['b.txt']
      )
      assert.equal(hasUnresolvedConflictFiles(wd), true)
    })

    it('does not return conflicted files whose markers have been resolved', () => {
      const unresolved = makeFile('b.txt', AppFileStatusKind.Conflicted)
      const resolved = new WorkingDirectoryFileChange(
        unresolved.path,
        {
          ...(unresolved.status as any),
          conflictMarkerCount: 0,
        },
        unresolved.selection
      )
      const wd = WorkingDirectoryStatus.fromFiles([resolved])

      assert.deepEqual(getUnresolvedConflictFiles(wd), [])
      assert.equal(hasUnresolvedConflictFiles(wd), false)
    })
  })
})
