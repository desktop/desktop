import { DiffSelectionType, DiffType } from '../../models/diff'
import { Repository } from '../../models/repository'
import {
  WorkingDirectoryFileChange,
  WorkingDirectoryStatus,
} from '../../models/status'
import { ChangesSelectionKind, IChangesState } from '../app-state'
import { getAssistedCommitInputVersions } from '../assisted-commit-request'
import { arrayEquals } from '../equality'
import { getWorkingDirectoryDiff } from '../git'
import {
  AssistedCommitError,
  readAssistedCommitHead,
} from '../git/assisted-commit'
import { AssistedCommitSelection } from './selection'
import { AssistedCommitState } from './state'
import { IAssistedCommitRun } from './types'
import { verifyRepositoryGitSpawnFence } from '../git/repository-operation'

/** Result of verifying and installing the current display diff. */
export type SelectionDisplayResult =
  | { readonly kind: 'updated' | 'unchanged' }
  | {
      readonly kind: 'invalid'
      readonly error: AssistedCommitError
      readonly run: IAssistedCommitRun | undefined
    }

function reconcileSelectionAfterAwait(
  latest: IChangesState,
  selectedFileIDsBeforeLoad: ReadonlyArray<string>,
  selectedFileID: string,
  currentlySelectedFile: WorkingDirectoryFileChange,
  selections: AssistedCommitSelection
):
  | { readonly kind: 'same' }
  | { readonly kind: 'adopted'; readonly file: WorkingDirectoryFileChange }
  | { readonly kind: 'unchanged' } {
  if (
    latest.selection.kind !== ChangesSelectionKind.WorkingDirectory ||
    !arrayEquals(latest.selection.selectedFileIDs, selectedFileIDsBeforeLoad)
  ) {
    return { kind: 'unchanged' }
  }
  const latestFile = latest.workingDirectory.findFileWithID(selectedFileID)
  if (latestFile === null) {
    return { kind: 'unchanged' }
  }
  if (latestFile.selection === currentlySelectedFile.selection) {
    return { kind: 'same' }
  }
  if (
    latestFile.status === currentlySelectedFile.status &&
    latestFile.selection.getSelectionType() !== DiffSelectionType.Partial &&
    !selections.hasRestored(latestFile.selection) &&
    selections.getBasis(latestFile.selection) === undefined
  ) {
    return { kind: 'adopted', file: latestFile }
  }
  return { kind: 'unchanged' }
}

function isRestoredSelectionSuperseded(
  latest: IChangesState,
  fileID: string,
  fileBeforeAwait: WorkingDirectoryFileChange,
  selections: AssistedCommitSelection
): boolean {
  if (selections.hasRestored(fileBeforeAwait.selection)) {
    return false
  }
  const latestFile = latest.workingDirectory.findFileWithID(fileID)
  return (
    latestFile === null || latestFile.selection !== fileBeforeAwait.selection
  )
}

function isRetainedBasisSuperseded(
  latest: IChangesState,
  fileID: string,
  fileBeforeAwait: WorkingDirectoryFileChange,
  selections: AssistedCommitSelection
): boolean {
  const latestFile = latest.workingDirectory.findFileWithID(fileID)
  if (latestFile === null) {
    return true
  }
  return (
    latestFile.selection !== fileBeforeAwait.selection &&
    latestFile.selection.getSelectionType() !== DiffSelectionType.Partial &&
    selections.getBasis(latestFile.selection) === undefined
  )
}

/** Refresh display bounds without manufacturing or broadening selected-change authority. */
export async function updateWorkingDirectorySelectionDiff(
  repository: Repository,
  state: AssistedCommitState,
  selections: AssistedCommitSelection,
  hideWhitespace: boolean,
  admittedRun: IAssistedCommitRun | undefined,
  ownerBefore: IAssistedCommitRun | undefined,
  getDiff: typeof getWorkingDirectoryDiff = getWorkingDirectoryDiff
): Promise<SelectionDisplayResult> {
  const hasOwnershipChanged = (): boolean => {
    if (state.selectionOwner(repository) !== admittedRun) {
      return true
    }
    if (admittedRun === undefined) {
      const currentRun = state.runs.get(repository.id)
      return currentRun !== undefined && currentRun !== ownerBefore
    }
    return false
  }

  const runSupersededGuard = async <T>(
    isSuperseded: () => boolean,
    read: () => Promise<T>
  ): Promise<
    { readonly ok: true; readonly value: T } | { readonly ok: false }
  > => {
    try {
      return { ok: true, value: await read() }
    } catch (error) {
      if (admittedRun === undefined && isSuperseded()) {
        return { ok: false }
      }
      throw error
    }
  }

  if (hasOwnershipChanged()) {
    return { kind: 'unchanged' }
  }

  const cache = state.cache
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

  const hadRestoredBeforeLoad = selections.hasRestored(
    selectedFileBeforeLoad.selection
  )
  const diffResult = await runSupersededGuard(
    () =>
      hadRestoredBeforeLoad &&
      isRestoredSelectionSuperseded(
        cache.get(repository).changesState,
        selectedFileIdBeforeLoad,
        selectedFileBeforeLoad,
        selections
      ),
    () => getDiff(repository, selectedFileBeforeLoad, hideWhitespace)
  )
  if (!diffResult.ok) {
    return { kind: 'unchanged' }
  }
  const diff = diffResult.value

  if (hasOwnershipChanged()) {
    return { kind: 'unchanged' }
  }

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

  let currentlySelectedFile =
    changesState.workingDirectory.findFileWithID(selectedFileID)
  if (currentlySelectedFile === null) {
    return { kind: 'unchanged' }
  }

  let basis = selections.getRestored(currentlySelectedFile.selection)
  const active = admittedRun
  const engineOwnsSelection =
    active?.snapshotAuthorized === true && !active.finished
  let retainedBasis =
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
    const fileBeforeAwait = currentlySelectedFile
    const canonicalResult = await runSupersededGuard(
      () =>
        isRetainedBasisSuperseded(
          cache.get(repository).changesState,
          selectedFileID,
          fileBeforeAwait,
          selections
        ),
      () => getDiff(repository, fileBeforeAwait, false, { noTextconv: true })
    )
    if (!canonicalResult.ok) {
      return { kind: 'unchanged' }
    }
    const canonical = canonicalResult.value
    if (hasOwnershipChanged()) {
      return { kind: 'unchanged' }
    }
    const reconciled = reconcileSelectionAfterAwait(
      cache.get(repository).changesState,
      selectedFileIDsBeforeLoad,
      selectedFileID,
      currentlySelectedFile,
      selections
    )
    if (reconciled.kind === 'unchanged') {
      return { kind: 'unchanged' }
    }
    if (reconciled.kind === 'adopted') {
      currentlySelectedFile = reconciled.file
      retainedBasis = undefined
    } else if (
      retainedBasis.text === null ||
      (canonical.kind !== DiffType.Text &&
        canonical.kind !== DiffType.LargeText) ||
      (diff.kind !== DiffType.Text && diff.kind !== DiffType.LargeText) ||
      canonical.text !== retainedBasis.text ||
      diff.text !== retainedBasis.text
    ) {
      return {
        kind: 'invalid',
        run: active,
        error: new AssistedCommitError(
          'selection-changed',
          'The original partial diff changed during display refresh. Review and reselect current changes.'
        ),
      }
    }
  }
  if (basis !== undefined) {
    if (basis.text !== null) {
      const fileBeforeAwait = currentlySelectedFile
      const canonicalResult = await runSupersededGuard(
        () =>
          isRestoredSelectionSuperseded(
            cache.get(repository).changesState,
            selectedFileID,
            fileBeforeAwait,
            selections
          ),
        () => getDiff(repository, fileBeforeAwait, false, { noTextconv: true })
      )
      if (!canonicalResult.ok) {
        return { kind: 'unchanged' }
      }
      const canonical = canonicalResult.value
      if (hasOwnershipChanged()) {
        return { kind: 'unchanged' }
      }
      const reconciled = reconcileSelectionAfterAwait(
        cache.get(repository).changesState,
        selectedFileIDsBeforeLoad,
        selectedFileID,
        currentlySelectedFile,
        selections
      )
      if (reconciled.kind === 'unchanged') {
        return { kind: 'unchanged' }
      }
      if (reconciled.kind === 'adopted') {
        currentlySelectedFile = reconciled.file
        basis = undefined
        retainedBasis = undefined
      } else if (
        (canonical.kind !== DiffType.Text &&
          canonical.kind !== DiffType.LargeText) ||
        (diff.kind !== DiffType.Text && diff.kind !== DiffType.LargeText) ||
        canonical.text !== basis.text ||
        diff.text !== basis.text
      ) {
        return {
          kind: 'invalid',
          run: active,
          error: new AssistedCommitError(
            'selection-changed',
            'The selected diff changed during refresh. Review and reselect current changes.'
          ),
        }
      }
    }
    if (basis !== undefined) {
      const fileBeforeAwait = currentlySelectedFile
      const versionResult = await runSupersededGuard(
        () =>
          isRestoredSelectionSuperseded(
            cache.get(repository).changesState,
            selectedFileID,
            fileBeforeAwait,
            selections
          ),
        async () => ({
          head: await readAssistedCommitHead(repository),
          versions: await getAssistedCommitInputVersions(repository, [
            fileBeforeAwait,
          ]),
        })
      )
      if (!versionResult.ok) {
        return { kind: 'unchanged' }
      }
      const { head, versions } = versionResult.value
      if (hasOwnershipChanged()) {
        return { kind: 'unchanged' }
      }
      const reconciled = reconcileSelectionAfterAwait(
        cache.get(repository).changesState,
        selectedFileIDsBeforeLoad,
        selectedFileID,
        currentlySelectedFile,
        selections
      )
      if (reconciled.kind === 'unchanged') {
        return { kind: 'unchanged' }
      }
      if (reconciled.kind === 'adopted') {
        currentlySelectedFile = reconciled.file
        basis = undefined
        retainedBasis = undefined
      } else if (
        head.ref !== basis.head.ref ||
        head.sha !== basis.head.sha ||
        versions[0] !== basis.version
      ) {
        return {
          kind: 'invalid',
          run: active,
          error: new AssistedCommitError(
            'selection-changed',
            'Selected files changed while their diff was being verified. Review and reselect current changes.'
          ),
        }
      }
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

  if (hasOwnershipChanged()) {
    return { kind: 'unchanged' }
  }

  const newSelection =
    currentlySelectedFile.selection.withSelectableLines(selectableLines)
  verifyRepositoryGitSpawnFence()
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
