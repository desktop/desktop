import { updateChangedFiles } from '../../../../src/lib/stores/updates/changes-state'
import {
  WorkingDirectoryStatus,
  WorkingDirectoryFileChange,
  AppFileStatusKind,
} from '../../../../src/models/status'
import {
  DiffSelection,
  DiffSelectionType,
  DiffType,
  IBinaryDiff,
} from '../../../../src/models/diff'
import {
  createState,
  createStatus,
} from '../../../helpers/changes-state-helper'
import {
  ChangesSelectionKind,
  ChangesWorkingDirectorySelection,
} from '../../../../src/lib/app-state'

const allSelected = DiffSelection.fromInitialSelection(DiffSelectionType.All)
const noneSelected = DiffSelection.fromInitialSelection(DiffSelectionType.None)

const files = [
  new WorkingDirectoryFileChange(
    'README.md',
    { kind: AppFileStatusKind.Modified },
    allSelected
  ),
  new WorkingDirectoryFileChange(
    'app/package.json',
    { kind: AppFileStatusKind.Modified },
    noneSelected
  ),
]

describe('updateChangedFiles', () => {
  describe('workingDirectory', () => {
    let partiallySelectedFile: WorkingDirectoryFileChange
    let oldWorkingDirectory: WorkingDirectoryStatus

    beforeEach(() => {
      const partialFileSelection = noneSelected
        .withSelectableLines(new Set([1, 2, 3, 4, 5, 6]))
        .withLineSelection(1, true)
        .withLineSelection(2, true)
        .withLineSelection(3, true)

      partiallySelectedFile = new WorkingDirectoryFileChange(
        'app/index.ts',
        { kind: AppFileStatusKind.New },
        partialFileSelection
      )

      const filesWithPartialChange = [...files, partiallySelectedFile]

      oldWorkingDirectory = WorkingDirectoryStatus.fromFiles(
        filesWithPartialChange
      )
    })

    it('clears partial selection on file when clearPartialState is true', () => {
      const prevState = createState({
        workingDirectory: oldWorkingDirectory,
      })

      const status = createStatus({
        workingDirectory: oldWorkingDirectory,
      })

      const { workingDirectory } = updateChangedFiles(prevState, status, true)

      const partialFile = workingDirectory.findFileWithID(
        partiallySelectedFile.id
      )

      expect(partialFile!.selection.getSelectionType()).toBe(
        DiffSelectionType.None
      )
    })

    it('preserves partial selection on file when clearPartialState is false', () => {
      const prevState = createState({
        workingDirectory: oldWorkingDirectory,
      })

      const status = createStatus({
        workingDirectory: oldWorkingDirectory,
      })

      const { workingDirectory } = updateChangedFiles(prevState, status, false)

      const partialFile = workingDirectory.findFileWithID(
        partiallySelectedFile.id
      )

      expect(partialFile!.selection.getSelectionType()).toBe(
        DiffSelectionType.Partial
      )
    })

    it('does not return same working directory object', () => {
      const oldWorkingDirectory = WorkingDirectoryStatus.fromFiles(files)
      const prevState = createState({
        workingDirectory: oldWorkingDirectory,
      })

      const status = createStatus({
        workingDirectory: oldWorkingDirectory,
      })

      const { workingDirectory } = updateChangedFiles(prevState, status, false)

      expect(workingDirectory).not.toBe(oldWorkingDirectory)
    })
  })

  describe('selectedFileIDs', () => {
    it('selects the first file if none found in state', () => {
      const prevState = createState({})

      const status = createStatus({
        workingDirectory: WorkingDirectoryStatus.fromFiles(files),
      })
      const { selection } = updateChangedFiles(prevState, status, false)

      expect(selection.kind).toBe(ChangesSelectionKind.WorkingDirectory)
      const workingDirectorySelection = selection as ChangesWorkingDirectorySelection
      const { selectedFileIDs } = workingDirectorySelection
      expect(selectedFileIDs).toHaveLength(1)
      // NOTE: `updateChangedFiles` sorts the paths and `app/package.json` will
      // appear in list before `README.md`
      expect(selectedFileIDs[0]).toBe(files[1].id)
    })

    it('remembers previous selection if file is found in status', () => {
      const firstFile = files[0].id
      const prevState = createState({
        selection: {
          kind: ChangesSelectionKind.WorkingDirectory,
          selectedFileIDs: [firstFile],
          diff: null,
        },
      })

      const status = createStatus({
        workingDirectory: WorkingDirectoryStatus.fromFiles(files),
      })
      const { selection } = updateChangedFiles(prevState, status, false)

      expect(selection.kind).toBe(ChangesSelectionKind.WorkingDirectory)
      const workingDirectorySelection = selection as ChangesWorkingDirectorySelection
      const { selectedFileIDs } = workingDirectorySelection
      expect(selectedFileIDs).toHaveLength(1)
      expect(selectedFileIDs[0]).toBe(firstFile)
    })

    it('clears selection if no files found in status', () => {
      const firstFile = files[0].id
      const prevState = createState({
        selection: {
          kind: ChangesSelectionKind.WorkingDirectory,
          selectedFileIDs: [firstFile],
          diff: null,
        },
      })

      const status = createStatus({})
      const { selection } = updateChangedFiles(prevState, status, false)

      expect(selection.kind).toBe(ChangesSelectionKind.WorkingDirectory)
      const workingDirectorySelection = selection as ChangesWorkingDirectorySelection
      const { selectedFileIDs } = workingDirectorySelection
      expect(selectedFileIDs).toHaveLength(0)
    })
  })

  describe('diff', () => {
    it('clears diff if selected file is not in previous state', () => {
      const workingDirectory = WorkingDirectoryStatus.fromFiles(files)

      const prevState = createState({
        workingDirectory: workingDirectory,
        selection: {
          kind: ChangesSelectionKind.WorkingDirectory,
          // an unknown file was set as selected last time
          selectedFileIDs: ['id-from-file-not-in-status'],
          diff: { kind: DiffType.Binary },
        },
      })

      const status = createStatus({ workingDirectory })
      const { selection } = updateChangedFiles(prevState, status, false)

      expect(selection.kind).toBe(ChangesSelectionKind.WorkingDirectory)

      const workingDirectorySelection = selection as ChangesWorkingDirectorySelection
      expect(workingDirectorySelection.diff).toBeNull()
    })

    it('returns same diff if selected file from previous state is found', () => {
      const workingDirectory = WorkingDirectoryStatus.fromFiles(files)

      // first file was selected the last time we updated state
      const selectedFileIDs = [files[0].id]
      const diff: IBinaryDiff = { kind: DiffType.Binary }

      const prevState = createState({
        workingDirectory,
        selection: {
          kind: ChangesSelectionKind.WorkingDirectory,
          selectedFileIDs,
          diff,
        },
      })

      // same working directory is provided as last time
      const status = createStatus({ workingDirectory })

      const { selection } = updateChangedFiles(prevState, status, false)
      expect(selection.kind).toBe(ChangesSelectionKind.WorkingDirectory)
      const workingDirectorySelection = selection as ChangesWorkingDirectorySelection
      expect(workingDirectorySelection.diff).toBe(diff)
    })
  })
})
