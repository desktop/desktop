import { updateChangedFiles } from '../../../../src/lib/stores/updates/changes-state'
import { IStatusResult } from '../../../../src/lib/git'
import { IChangesState } from '../../../../src/lib/app-state'
import {
  WorkingDirectoryStatus,
  WorkingDirectoryFileChange,
  AppFileStatus,
} from '../../../../src/models/status'
import {
  DiffSelection,
  DiffSelectionType,
  DiffType,
  IBinaryDiff,
} from '../../../../src/models/diff'

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

const allSelected = DiffSelection.fromInitialSelection(DiffSelectionType.All)

describe('updateChangedFiles', () => {
  describe('diff', () => {
    it('clears diff if selected file is not found', () => {
      const files = [
        new WorkingDirectoryFileChange(
          'README.md',
          AppFileStatus.New,
          allSelected
        ),
      ]

      const workingDirectory = WorkingDirectoryStatus.fromFiles(files)

      const previousDiff: IBinaryDiff = { kind: DiffType.Binary }

      const prevState = {
        ...baseChangesState,
        workingDirectory: workingDirectory,
        selectedFileIDs: [],
        diff: previousDiff,
      }

      const status = { ...baseStatus, workingDirectory }
      const { diff } = updateChangedFiles(status, false, prevState)

      expect(diff).toBeNull()
    })

    it('returns same diff if selected file is still found', () => {
      const files = [
        new WorkingDirectoryFileChange(
          'README.md',
          AppFileStatus.New,
          allSelected
        ),
      ]

      const workingDirectory = WorkingDirectoryStatus.fromFiles(files)

      const selectedFileIDs = [files[0].id]

      const previousDiff: IBinaryDiff = { kind: DiffType.Binary }

      const prevState = {
        ...baseChangesState,
        workingDirectory,
        selectedFileIDs,
        diff: previousDiff,
      }

      const status = { ...baseStatus, workingDirectory }

      const { diff } = updateChangedFiles(status, false, prevState)

      expect(diff).toBe(previousDiff)
    })
  })
})
