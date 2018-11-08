import { updateChangedFiles } from '../../../../src/lib/stores/updates/changes-state'
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
import { createState, createStatus } from './changes-state-helper'

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
    it('defaults to selecting the first file if none set', () => {
      const prevState = createState({})

      const workingDirectory = WorkingDirectoryStatus.fromFiles(files)
      const status = createStatus({ workingDirectory })
      const { selectedFileIDs } = updateChangedFiles(status, false, prevState)

      expect(selectedFileIDs).toHaveLength(1)
      // function sorts the paths and `app/package.json` appears before `README.md`
      expect(selectedFileIDs[0]).toBe(files[1].id)
    })

    it('remembers previous selection if file is found in status', () => {
      const firstFile = files[0].id
      const prevState = createState({
        selectedFileIDs: [firstFile],
      })

      const workingDirectory = WorkingDirectoryStatus.fromFiles(files)
      const status = createStatus({ workingDirectory })
      const { selectedFileIDs } = updateChangedFiles(status, false, prevState)

      expect(selectedFileIDs).toHaveLength(1)
      expect(selectedFileIDs[0]).toBe(firstFile)
    })
  })

  describe('diff', () => {
    it('clears diff if selected file is not in previous state', () => {
      const workingDirectory = WorkingDirectoryStatus.fromFiles(files)

      const prevState = createState({
        workingDirectory: workingDirectory,
        // an unknown file was set as selected last time
        selectedFileIDs: ['id-from-file-not-in-status'],
        diff: { kind: DiffType.Binary },
      })

      const status = createStatus({ workingDirectory })
      const { diff } = updateChangedFiles(status, false, prevState)

      expect(diff).toBeNull()
    })

    it('returns same diff if selected file from previous state is found', () => {
      const workingDirectory = WorkingDirectoryStatus.fromFiles(files)

      // first file was selected the last time we updated state
      const selectedFileIDs = [files[0].id]

      const prevState = createState({
        workingDirectory,
        selectedFileIDs,
        diff: { kind: DiffType.Binary },
      })

      // same working directory is provided as last time
      const status = createStatus({ workingDirectory })

      const { diff } = updateChangedFiles(status, false, prevState)

      expect(diff).toBe(prevState.diff)
    })
  })
})
