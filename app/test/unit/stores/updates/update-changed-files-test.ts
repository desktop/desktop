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
const noneSelected = DiffSelection.fromInitialSelection(DiffSelectionType.None)

const files = [
  new WorkingDirectoryFileChange(
    'README.md',
    AppFileStatus.Modified,
    allSelected
  ),
  new WorkingDirectoryFileChange(
    'app/package.json',
    AppFileStatus.Modified,
    noneSelected
  ),
]

describe('updateChangedFiles', () => {
  describe('workingDirectory', () => {
    // preserves selection state if clearPartialState is false
    // resets selection state if clearPartialState is true
    // returns a different object than status.workingDirectory
  })

  describe('selectedFileIDs', () => {
    // defaults to first file if not set
    // should not be empty
  })

  describe('diff', () => {
    it('clears diff if selected file is not in previous state', () => {
      const workingDirectory = WorkingDirectoryStatus.fromFiles(files)

      const previousDiff: IBinaryDiff = { kind: DiffType.Binary }

      const prevState = {
        ...baseChangesState,
        workingDirectory: workingDirectory,
        // an unknown file was set as selected last time
        selectedFileIDs: ['id-from-file-not-in-status'],
        diff: previousDiff,
      }

      const status = { ...baseStatus, workingDirectory }
      const { diff } = updateChangedFiles(status, false, prevState)

      expect(diff).toBeNull()
    })

    it('returns same diff if selected file from previous state is found', () => {
      const workingDirectory = WorkingDirectoryStatus.fromFiles(files)

      // first file was selected the last time we updated state
      const selectedFileIDs = [files[0].id]

      const previousDiff: IBinaryDiff = { kind: DiffType.Binary }

      const prevState = {
        ...baseChangesState,
        workingDirectory,
        selectedFileIDs,
        diff: previousDiff,
      }

      // same working directory is provided as last time
      const status = { ...baseStatus, workingDirectory }

      const { diff } = updateChangedFiles(status, false, prevState)

      expect(diff).toBe(previousDiff)
    })
  })
})
