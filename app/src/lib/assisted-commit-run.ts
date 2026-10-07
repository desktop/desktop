import { IAssistedCommitSnapshot } from '../models/assisted-commit'
import {
  DiffLineType,
  DiffSelection,
  DiffSelectionType,
  IRawDiff,
} from '../models/diff'
import { WorkingDirectoryFileChange } from '../models/status'
import { CopilotAssistedCommitError } from './copilot-assisted-commit'
import { DiffParser } from './diff-parser'
import { getErrorCauses } from './error-with-metadata'
import {
  AssistedCommitError,
  IAssistedCommitRecovery,
} from './git/assisted-commit'

/** All causes, including SDK wrappers and aggregates; never discard cleanup or recovery failures. */
export function assistedCommitErrorCauses(
  error: unknown
): ReadonlyArray<unknown> {
  return getErrorCauses(error)
}

/** Recovery belongs to the engine error even when a surrounding scope adds cleanup context. */
export function getAssistedCommitRecovery(
  error: unknown
): IAssistedCommitRecovery | undefined {
  return assistedCommitErrorCauses(error).find(
    (cause): cause is AssistedCommitError =>
      cause instanceof AssistedCommitError && cause.recovery !== undefined
  )?.recovery
}

/** Only a domain cancellation with no failed cleanup/recovery is a quiet cancellation. */
export function isAssistedCommitCancellation(error: unknown): boolean {
  const causes = assistedCommitErrorCauses(error)
  return (
    causes.some(
      cause =>
        (cause instanceof AssistedCommitError ||
          cause instanceof CopilotAssistedCommitError) &&
        cause.code === 'cancelled'
    ) &&
    !causes.some(
      cause =>
        (cause instanceof AssistedCommitError ||
          cause instanceof CopilotAssistedCommitError) &&
        (cause.code === 'cleanup-failed' || cause.code === 'recovery-failed')
    )
  )
}

interface IAnchoredChange {
  readonly index: number
  readonly key: string
}

function anchoredChanges(
  diff: Pick<IRawDiff, 'hunks'>
): ReadonlyArray<IAnchoredChange> {
  return diff.hunks.flatMap(hunk => {
    let oldLine =
      hunk.header.oldStartLine + (hunk.header.oldLineCount === 0 ? 1 : 0)
    return hunk.lines.flatMap((line, index) => {
      const key = JSON.stringify([
        line.type,
        oldLine,
        line.text,
        line.noTrailingNewLine,
      ])
      if (
        line.type === DiffLineType.Delete ||
        line.type === DiffLineType.Context
      ) {
        oldLine++
      }
      return line.isIncludeableLine()
        ? [{ index: hunk.unifiedDiffStart + index, key }]
        : []
    })
  })
}

/**
 * Reconcile a mutated selected text file against CURRENT diff content and original HEAD anchors.
 *
 * Never reuse stale line offsets. Ambiguous, removed, binary, and changed-identity
 * content stays excluded for explicit user review; newly added content is not selected.
 */
export function reconcileAssistedCommitSelection(
  snapshot: IAssistedCommitSnapshot,
  file: WorkingDirectoryFileChange,
  currentDiff: Pick<IRawDiff, 'hunks'>
): { readonly selection: DiffSelection; readonly needsReview: boolean } {
  if (
    snapshot.analysis.changes.some(
      change => change.path === file.path && change.kind === 'atomic'
    )
  ) {
    return {
      selection: DiffSelection.fromInitialSelection(DiffSelectionType.None),
      needsReview: true,
    }
  }
  const selected = snapshot.analysis.changes
    .filter(change => change.path === file.path)
    .flatMap(change => anchoredChanges(new DiffParser().parse(change.diff)))
  const current = anchoredChanges(currentDiff)
  const selectedKeys = new Set(selected.map(change => change.key))
  const currentCounts = new Map<string, number>()
  current.forEach(change =>
    currentCounts.set(change.key, (currentCounts.get(change.key) ?? 0) + 1)
  )
  const selectedCounts = new Map<string, number>()
  selected.forEach(change =>
    selectedCounts.set(change.key, (selectedCounts.get(change.key) ?? 0) + 1)
  )
  let selection = DiffSelection.fromInitialSelection(
    DiffSelectionType.None
  ).withSelectableLines(new Set(current.map(change => change.index)))
  let matched = 0
  for (const change of current) {
    if (
      selectedKeys.has(change.key) &&
      currentCounts.get(change.key) === 1 &&
      selectedCounts.get(change.key) === 1
    ) {
      selection = selection.withLineSelection(change.index, true)
      matched++
    }
  }
  return {
    selection,
    needsReview: selected.length === 0 || matched !== selected.length,
  }
}
