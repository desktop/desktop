import { ChangesSelectionKind } from '../app-state'
import { DiffSelectionType, DiffType } from '../../models/diff'
import { Repository } from '../../models/repository'
import { WorkingDirectoryStatus } from '../../models/status'
import { getAssistedCommitInputVersions } from '../assisted-commit-request'
import { arrayEquals } from '../equality'
import { getWorkingDirectoryDiff } from '../git'
import {
  AssistedCommitError,
  readAssistedCommitHead,
} from '../git/assisted-commit'
import { RepositoryStateCache } from '../stores/repository-state-cache'
import { AssistedCommitSelection } from './selection'

/** Result of verifying and installing the current display diff. */
export type SelectionDisplayResult =
  | { readonly kind: 'updated' | 'unchanged' }
  | { readonly kind: 'invalid'; readonly error: AssistedCommitError }

/** Refresh display bounds without manufacturing or broadening selected-change authority. */
export async function updateWorkingDirectorySelectionDiff(
  repository: Repository,
  cache: RepositoryStateCache,
  selections: AssistedCommitSelection,
  hideWhitespace: boolean,
  engineOwnsSelection: boolean
): Promise<SelectionDisplayResult> {
  const stateBeforeLoad = cache.get(repository)
  const changesStateBeforeLoad = stateBeforeLoad.changesState

  if (
    changesStateBeforeLoad.selection.kind !==
    ChangesSelectionKind.WorkingDirectory
  ) {
    return { kind: 'unchanged' }
  }

  const selectionBeforeLoad = changesStateBeforeLoad.selection
  const selectedFileIDsBeforeLoad = selectionBeforeLoad.selectedFileIDs

  // We only render diffs when a single file is selected.
  if (selectedFileIDsBeforeLoad.length !== 1) {
    if (selectionBeforeLoad.diff !== null) {
      cache.updateChangesState(repository, () => ({
        selection: {
          ...selectionBeforeLoad,
          diff: null,
        },
      }))
      return { kind: 'updated' }
    }
    return { kind: 'unchanged' }
  }

  const selectedFileIdBeforeLoad = selectedFileIDsBeforeLoad[0]
  const selectedFileBeforeLoad =
    changesStateBeforeLoad.workingDirectory.findFileWithID(
      selectedFileIdBeforeLoad
    )

  if (selectedFileBeforeLoad === null) {
    return { kind: 'unchanged' }
  }

  const diff = await getWorkingDirectoryDiff(
    repository,
    selectedFileBeforeLoad,
    hideWhitespace
  )

  const stateAfterLoad = cache.get(repository)
  const changesState = stateAfterLoad.changesState

  // A different file (or files) could have been selected while we were
  // loading the diff in which case we no longer care about the diff we
  // just loaded.
  if (
    changesState.selection.kind !== ChangesSelectionKind.WorkingDirectory ||
    !arrayEquals(
      changesState.selection.selectedFileIDs,
      selectedFileIDsBeforeLoad
    )
  ) {
    return { kind: 'unchanged' }
  }

  const selectedFileID = changesState.selection.selectedFileIDs[0]

  if (selectedFileID !== selectedFileIdBeforeLoad) {
    return { kind: 'unchanged' }
  }

  const currentlySelectedFile =
    changesState.workingDirectory.findFileWithID(selectedFileID)
  if (currentlySelectedFile === null) {
    return { kind: 'unchanged' }
  }

  const basis = selections.getRestored(currentlySelectedFile.selection)
  const retainedBasis =
    selections.getBasis(currentlySelectedFile.selection) ??
    (currentlySelectedFile.selection.getSelectionType() ===
      DiffSelectionType.Partial && !engineOwnsSelection
      ? {
          text: basis?.text ?? null,
          sourceSelectionType: DiffSelectionType.Partial,
        }
      : undefined)
  if (
    basis === undefined &&
    retainedBasis !== undefined &&
    changesState.commitMode === 'copilot' &&
    changesState.assistedCommitAvailable
  ) {
    const canonical = await getWorkingDirectoryDiff(
      repository,
      currentlySelectedFile,
      false,
      { noTextconv: true }
    )
    const latest = cache.get(repository).changesState
    if (
      latest.selection.kind !== ChangesSelectionKind.WorkingDirectory ||
      !arrayEquals(
        latest.selection.selectedFileIDs,
        selectedFileIDsBeforeLoad
      ) ||
      latest.workingDirectory.findFileWithID(selectedFileID)?.selection !==
        currentlySelectedFile.selection
    ) {
      return { kind: 'unchanged' }
    }
    if (
      retainedBasis.text === null ||
      (canonical.kind !== DiffType.Text &&
        canonical.kind !== DiffType.LargeText) ||
      (diff.kind !== DiffType.Text && diff.kind !== DiffType.LargeText) ||
      canonical.text !== retainedBasis.text ||
      diff.text !== retainedBasis.text
    ) {
      return {
        kind: 'invalid',
        error: new AssistedCommitError(
          'selection-changed',
          'The original partial diff changed during display refresh. Review and reselect current changes.'
        ),
      }
    }
  }
  if (basis !== undefined) {
    if (basis.text !== null) {
      const canonical = await getWorkingDirectoryDiff(
        repository,
        currentlySelectedFile,
        false,
        { noTextconv: true }
      )
      if (
        (canonical.kind !== DiffType.Text &&
          canonical.kind !== DiffType.LargeText) ||
        (diff.kind !== DiffType.Text && diff.kind !== DiffType.LargeText) ||
        canonical.text !== basis.text ||
        diff.text !== basis.text
      ) {
        return {
          kind: 'invalid',
          error: new AssistedCommitError(
            'selection-changed',
            'The selected diff changed during refresh. Review and reselect current changes.'
          ),
        }
      }
    }
    const head = await readAssistedCommitHead(repository)
    const versions = await getAssistedCommitInputVersions(repository, [
      currentlySelectedFile,
    ])
    if (
      head.ref !== basis.head.ref ||
      head.sha !== basis.head.sha ||
      versions[0] !== basis.version
    ) {
      return {
        kind: 'invalid',
        error: new AssistedCommitError(
          'selection-changed',
          'Selected files changed while their diff was being verified. Review and reselect current changes.'
        ),
      }
    }
    const latest = cache.get(repository).changesState
    if (
      latest.selection.kind !== ChangesSelectionKind.WorkingDirectory ||
      !arrayEquals(
        latest.selection.selectedFileIDs,
        selectedFileIDsBeforeLoad
      ) ||
      latest.workingDirectory.findFileWithID(selectedFileID)?.selection !==
        currentlySelectedFile.selection
    ) {
      return { kind: 'unchanged' }
    }
  }

  const selectableLines = new Set<number>()
  if (diff.kind === DiffType.Text || diff.kind === DiffType.LargeText) {
    // The diff might have changed dramatically since last we loaded it.
    // Ideally we would be more clever about validating that any partial
    // selection state is still valid by ensuring that selected lines still
    // exist but for now we'll settle on just updating the selectable lines
    // such that any previously selected line which now no longer exists or
    // has been turned into a context line isn't still selected.
    diff.hunks.forEach(h => {
      h.lines.forEach((line, index) => {
        if (line.isIncludeableLine()) {
          selectableLines.add(h.unifiedDiffStart + index)
        }
      })
    })
  }

  const newSelection =
    currentlySelectedFile.selection.withSelectableLines(selectableLines)
  selections.inheritDisplaySelection(newSelection, basis, retainedBasis)
  cache.updateChangesState(repository, latest => {
    const unchanged = {
      selection: latest.selection,
      workingDirectory: latest.workingDirectory,
    }
    if (
      latest.selection.kind !== ChangesSelectionKind.WorkingDirectory ||
      !arrayEquals(latest.selection.selectedFileIDs, selectedFileIDsBeforeLoad)
    ) {
      return unchanged
    }
    const currentFile = latest.workingDirectory.findFileWithID(selectedFileID)
    if (
      currentFile === null ||
      currentFile.selection !== currentlySelectedFile.selection
    ) {
      return unchanged
    }
    const selectedFile = currentFile.withSelection(newSelection)
    return {
      selection: { ...latest.selection, diff },
      workingDirectory: WorkingDirectoryStatus.fromFiles(
        latest.workingDirectory.files.map(file =>
          file.id === selectedFile.id ? selectedFile : file
        )
      ),
    }
  })
  return { kind: 'updated' }
}
