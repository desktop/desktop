import { IRepositoryState, ChangesSelectionKind } from '../app-state'
import {
  IAssistedCommitHead,
  IAssistedCommitSnapshot,
} from '../../models/assisted-commit'
import { ICopilotAssistedCommitRequest } from '../../models/copilot-assisted-commit'
import {
  DiffSelection,
  DiffSelectionType,
  DiffType,
  IDiff,
  ITextDiff,
  ILargeTextDiff,
} from '../../models/diff'
import { Repository } from '../../models/repository'
import {
  WorkingDirectoryFileChange,
  WorkingDirectoryStatus,
} from '../../models/status'
import { TipState } from '../../models/tip'
import {
  assistedCommitInputIdentityMatches,
  getAssistedCommitInputVersions,
} from '../assisted-commit-request'
import { reconcileAssistedCommitSelection } from '../assisted-commit-run'
import { arrayEquals } from '../equality'
import { getWorkingDirectoryDiff } from '../git'
import {
  AssistedCommitError,
  IAssistedCommitRecovery,
  IAssistedCommitResult,
  readAssistedCommitHead,
} from '../git/assisted-commit'
import {
  protectAssistedCommitResources,
  withRepositoryGitErrorPropagation,
  withRepositoryGitOperation,
} from '../git/repository-operation'
import { RepositoryStateCache } from '../stores/repository-state-cache'
import { getTipSha } from '../tip'

/** Frozen inputs and verified transaction history needed to restore selection. */
export interface IAssistedCommitSelectionSource {
  readonly repository: Repository
  readonly request: ICopilotAssistedCommitRequest
  readonly initialState: IRepositoryState
  readonly inputVersions?: ReadonlyArray<string>
  readonly snapshotAuthorized?: boolean
  readonly snapshot?: IAssistedCommitSnapshot
  readonly recovery?: IAssistedCommitRecovery
  readonly result?: IAssistedCommitResult
  selectionFence?: {
    readonly head: IAssistedCommitHead
    readonly versions: ReadonlyArray<string>
  }
}

interface IRestoredSelection {
  readonly text: string | null
  readonly head: IAssistedCommitHead
  readonly version: string
}

interface ISelectionBasis {
  readonly text: string | null
  readonly sourceSelectionType:
    | DiffSelectionType.All
    | DiffSelectionType.Partial
}

/** Owns selection certificates and original diff lineage across native refreshes. */
export class AssistedCommitSelection {
  private readonly restored = new WeakMap<DiffSelection, IRestoredSelection>()
  private readonly bases = new WeakMap<DiffSelection, ISelectionBasis>()

  public constructor(
    private readonly cache: RepositoryStateCache,
    private readonly hideWhitespace: () => boolean
  ) {}

  /** Whether a selection carries verified restored authority. */
  public hasRestored(selection: DiffSelection): boolean {
    return this.restored.has(selection)
  }

  /** Retire restored certificates when cleanup must reconcile current content. */
  public clearRestored(repository: Repository): void {
    for (const file of this.cache.get(repository).changesState.workingDirectory
      .files) {
      this.restored.delete(file.selection)
    }
  }

  /** Revalidate restored diff, HEAD and file-version certificates before reuse. */
  public async verifyRestored(
    repository: Repository,
    selectedFiles: ReadonlyArray<WorkingDirectoryFileChange> = this.cache.get(
      repository
    ).changesState.workingDirectory.files
  ): Promise<ReadonlyMap<string, ITextDiff | ILargeTextDiff>> {
    const certified = new Map<string, ITextDiff | ILargeTextDiff>()
    const files = selectedFiles.filter(
      file =>
        file.selection.getSelectionType() !== DiffSelectionType.None &&
        this.restored.has(file.selection)
    )
    if (files.length === 0) {
      return certified
    }
    for (const file of files) {
      const authority = this.restored.get(file.selection)
      if (authority?.text === null) {
        continue
      }
      const diff = await this.getRecoveryDiff(repository, file)
      if (
        authority === undefined ||
        diff === null ||
        (diff.kind !== DiffType.Text && diff.kind !== DiffType.LargeText) ||
        diff.text !== authority.text
      ) {
        throw new AssistedCommitError(
          'selection-changed',
          'Restored selected changes no longer match their verified diff. Review and reselect current changes.'
        )
      }
      if (file.selection.getSelectionType() === DiffSelectionType.Partial) {
        certified.set(file.id, diff)
      }
    }
    const head = await readAssistedCommitHead(repository)
    const versions = await getAssistedCommitInputVersions(repository, files)
    if (
      files.some((file, index) => {
        const authority = this.restored.get(file.selection)
        return (
          authority === undefined ||
          authority.head.ref !== head.ref ||
          authority.head.sha !== head.sha ||
          authority.version !== versions[index]
        )
      })
    ) {
      throw new AssistedCommitError(
        'selection-changed',
        'Restored selected files changed before refresh or commit admission. Review and reselect current changes.'
      )
    }
    return certified
  }

  /** Certify restored masks before native manual staging consumes them. */
  public async verifyManual(
    repository: Repository,
    files: ReadonlyArray<WorkingDirectoryFileChange>
  ): Promise<ReadonlyMap<string, ITextDiff | ILargeTextDiff>> {
    const restored = files.filter(file => this.restored.has(file.selection))
    if (restored.length === 0) {
      return new Map()
    }
    const assertCurrentSelection = () => {
      const changes = this.cache.get(repository).changesState.workingDirectory
      if (
        restored.some(file => {
          const current = changes.findFileWithID(file.id)
          return (
            current === null ||
            !file.selection.equals(current.selection) ||
            JSON.stringify(file.status) !== JSON.stringify(current.status)
          )
        })
      ) {
        throw new AssistedCommitError(
          'selection-changed',
          'Restored selected changes changed before manual commit admission. Review and reselect current changes.'
        )
      }
    }
    assertCurrentSelection()
    const certified = await withRepositoryGitErrorPropagation(() =>
      this.verifyRestored(repository, restored)
    )
    assertCurrentSelection()
    return certified
  }

  /** Bind requested masks to their original diff before snapshot capture. */
  public async verifyRequested(
    repository: Repository,
    files: ReadonlyArray<WorkingDirectoryFileChange>
  ): Promise<ReadonlyArray<string>> {
    const protection = protectAssistedCommitResources(repository.path)
    try {
      return await withRepositoryGitOperation(repository.path, 'read', () =>
        withRepositoryGitErrorPropagation(async () => {
          const versions = await getAssistedCommitInputVersions(
            repository,
            files
          )
          await this.verifyRestored(repository, files)
          for (const file of files) {
            const retained = this.bases.get(file.selection)
            const type = file.selection.getSelectionType()
            if (type !== DiffSelectionType.Partial && retained === undefined) {
              continue
            }
            if (
              type === DiffSelectionType.All &&
              retained?.sourceSelectionType === DiffSelectionType.Partial
            ) {
              throw new AssistedCommitError(
                'selection-changed',
                'The original partial selection became whole-file selection during refresh. Review and reselect current changes.'
              )
            }
            const basis =
              retained?.text ?? this.restored.get(file.selection)?.text
            const diff = await this.getRecoveryDiff(repository, file)
            if (
              basis === undefined ||
              basis === null ||
              diff === null ||
              (diff.kind !== DiffType.Text &&
                diff.kind !== DiffType.LargeText) ||
              diff.text !== basis
            ) {
              throw new AssistedCommitError(
                'selection-changed',
                'The selected partial diff no longer matches its original basis. Review and reselect current changes.'
              )
            }
          }
          const current = await getAssistedCommitInputVersions(
            repository,
            files
          )
          if (!arrayEquals(versions, current)) {
            throw new AssistedCommitError(
              'selection-changed',
              'Selected files changed while their selection was being verified. Review and reselect current changes.'
            )
          }
          return versions
        })
      )
    } finally {
      protection.release()
    }
  }

  /** Preserve verified selections when cancellation happens before capture. */
  public async certifyUncaptured(
    run: IAssistedCommitSelectionSource
  ): Promise<void> {
    const versions = await getAssistedCommitInputVersions(
      run.repository,
      run.request.files
    )
    if (
      run.inputVersions !== undefined &&
      !arrayEquals(versions, run.inputVersions)
    ) {
      throw new AssistedCommitError(
        'selection-changed',
        'Selected files changed while waiting. Retry refresh and reselect current changes.'
      )
    }
    const head = await readAssistedCommitHead(run.repository)
    this.assertCapturedHead(run, head)
    const bases = new Map<
      DiffSelection,
      { readonly index: number; readonly text: string | null }
    >()
    for (const [index, file] of run.request.files.entries()) {
      if (file.selection.getSelectionType() === DiffSelectionType.Partial) {
        const diff = await this.getRecoveryDiff(run.repository, file)
        const originalText =
          this.bases.get(file.selection)?.text ??
          this.restored.get(file.selection)?.text
        if (
          diff === null ||
          (diff.kind !== DiffType.Text && diff.kind !== DiffType.LargeText) ||
          originalText === undefined ||
          originalText !== diff.text
        ) {
          throw new AssistedCommitError(
            'selection-changed',
            'The original partial diff could not be verified. Review and reselect current changes.'
          )
        }
        bases.set(file.selection, { index, text: diff.text })
      } else {
        bases.set(file.selection, { index, text: null })
      }
    }
    const latestHead = await readAssistedCommitHead(run.repository)
    this.assertCapturedHead(run, latestHead)
    const latestVersions = await getAssistedCommitInputVersions(
      run.repository,
      run.request.files
    )
    if (!arrayEquals(versions, latestVersions)) {
      throw new AssistedCommitError(
        'selection-changed',
        'Selected files changed while checking cancellation. Retry refresh and reselect current changes.'
      )
    }
    for (const [selection, basis] of bases) {
      this.restored.set(selection, {
        text: basis.text,
        head: latestHead,
        version: latestVersions[basis.index],
      })
    }
    run.selectionFence = { head: latestHead, versions: latestVersions }
  }

  /** Read canonical diff only when the current display has identical semantics. */
  public async getRecoveryDiff(
    repository: Repository,
    file: WorkingDirectoryFileChange
  ): Promise<IDiff | null> {
    const canonical = await getWorkingDirectoryDiff(repository, file, false, {
      noTextconv: true,
    })
    const displayed = await getWorkingDirectoryDiff(
      repository,
      file,
      this.hideWhitespace()
    )
    if (
      (canonical.kind === DiffType.Text ||
        canonical.kind === DiffType.LargeText) &&
      (displayed.kind === DiffType.Text ||
        displayed.kind === DiffType.LargeText) &&
      canonical.text === displayed.text
    ) {
      return canonical
    }
    return null
  }

  /** Check that reconciliation still describes the same HEAD and selected files. */
  public async verifyFence(run: IAssistedCommitSelectionSource): Promise<void> {
    const fence = run.selectionFence
    if (fence === undefined) {
      return
    }
    const head = await readAssistedCommitHead(run.repository)
    const versions = await getAssistedCommitInputVersions(
      run.repository,
      run.request.files
    )
    if (
      head.ref !== fence.head.ref ||
      head.sha !== fence.head.sha ||
      !arrayEquals(versions, fence.versions)
    ) {
      throw new AssistedCommitError(
        'selection-changed',
        'Repository or selected files changed during refresh. Retry refresh before committing.'
      )
    }
  }

  /** Retire consumed UI certificates only after snapshot or manual acceptance. */
  public retire(
    repository: Repository,
    files: ReadonlyArray<WorkingDirectoryFileChange>
  ): void {
    const ids = new Set(files.map(file => file.id))
    for (const file of this.cache.get(repository).changesState.workingDirectory
      .files) {
      if (ids.has(file.id)) {
        this.restored.delete(file.selection)
        this.bases.delete(file.selection)
      }
    }
  }

  /** Reconcile original selected changes against verified current files and history. */
  public async restore(run: IAssistedCommitSelectionSource): Promise<boolean> {
    const current = this.cache.get(run.repository)
    const tip = current.branchesState.tip
    const snapshot = run.snapshotAuthorized === true ? run.snapshot : undefined
    const currentHead =
      run.recovery === undefined && run.result === undefined
        ? await readAssistedCommitHead(run.repository)
        : undefined
    const sameHead =
      snapshot === undefined
        ? assistedCommitHeadMatches(run.initialState.branchesState.tip, tip)
        : currentHead !== undefined
        ? currentHead.ref === snapshot.originalHead.ref &&
          currentHead.sha === snapshot.originalHead.sha
        : snapshot.originalHead.sha === null
        ? tip.kind === TipState.Unborn
        : getTipSha(tip) === snapshot.originalHead.sha
    const versions = await getAssistedCommitInputVersions(
      run.repository,
      run.request.files
    )
    const original = new Map(
      run.initialState.changesState.workingDirectory.files.map(file => [
        file.id,
        file,
      ])
    )
    let needsReview = !sameHead
    const files: WorkingDirectoryFileChange[] = []
    const bases = new Map<
      DiffSelection,
      { readonly index: number; readonly text: string | null }
    >()
    for (const file of current.changesState.workingDirectory.files) {
      const previous = original.get(file.id)
      if (
        previous === undefined ||
        previous.selection.getSelectionType() === DiffSelectionType.None
      ) {
        files.push(file.withIncludeAll(false))
      } else if (
        sameHead &&
        (previous.selection.getSelectionType() !== DiffSelectionType.Partial ||
          snapshot === undefined) &&
        run.request.files.some(
          (selected, index) =>
            selected.id === file.id &&
            run.inputVersions?.[index] === versions[index]
        )
      ) {
        const diff =
          previous.selection.getSelectionType() === DiffSelectionType.Partial
            ? await this.getRecoveryDiff(run.repository, file)
            : null
        const text =
          diff !== null &&
          (diff.kind === DiffType.Text || diff.kind === DiffType.LargeText)
            ? diff.text
            : null
        if (
          previous.selection.getSelectionType() === DiffSelectionType.Partial &&
          (text === null || text !== this.bases.get(previous.selection)?.text)
        ) {
          files.push(file.withIncludeAll(false))
          needsReview = true
          continue
        }
        bases.set(previous.selection, {
          index: run.request.files.findIndex(
            selected => selected.id === file.id
          ),
          text,
        })
        files.push(file.withSelection(previous.selection))
      } else if (
        sameHead &&
        snapshot !== undefined &&
        run.request.files.some(
          (selected, index) =>
            selected.id === file.id &&
            assistedCommitInputIdentityMatches(
              run.inputVersions?.[index],
              versions[index]
            )
        )
      ) {
        const diff = await this.getRecoveryDiff(run.repository, file)
        if (
          diff !== null &&
          (diff.kind === DiffType.Text || diff.kind === DiffType.LargeText)
        ) {
          const reconciled = reconcileAssistedCommitSelection(
            snapshot,
            file,
            diff
          )
          bases.set(reconciled.selection, {
            index: run.request.files.findIndex(
              selected => selected.id === file.id
            ),
            text: diff.text,
          })
          files.push(file.withSelection(reconciled.selection))
          needsReview ||= reconciled.needsReview
        } else {
          files.push(file.withIncludeAll(false))
          needsReview = true
        }
      } else {
        files.push(file.withIncludeAll(false))
        needsReview = true
      }
    }
    needsReview ||= run.request.files.some(
      file => !files.some(current => current.id === file.id)
    )
    const latestHead = await readAssistedCommitHead(run.repository)
    const expectedHead = currentHead ?? snapshot?.originalHead
    if (
      expectedHead !== undefined &&
      (latestHead.ref !== expectedHead.ref ||
        latestHead.sha !== expectedHead.sha)
    ) {
      throw new AssistedCommitError(
        'repository-changed',
        'HEAD changed while restoring selection. Retry refresh after repository changes stop.'
      )
    }
    const latestVersions = await getAssistedCommitInputVersions(
      run.repository,
      run.request.files
    )
    if (!arrayEquals(versions, latestVersions)) {
      throw new AssistedCommitError(
        'selection-changed',
        'Selected files changed while restoring selection. Retry refresh after editing stops.'
      )
    }
    for (const [selection, basis] of bases) {
      this.restored.set(selection, {
        text: basis.text,
        head: latestHead,
        version: latestVersions[basis.index],
      })
    }
    run.selectionFence = { head: latestHead, versions: latestVersions }
    const verified = new Map(files.map(file => [file.id, file]))
    this.cache.updateChangesState(run.repository, changes => ({
      workingDirectory: WorkingDirectoryStatus.fromFiles(
        changes.workingDirectory.files.map(file => {
          const checked = verified.get(file.id)
          return checked !== undefined &&
            JSON.stringify(checked.status) === JSON.stringify(file.status)
            ? file.withSelection(checked.selection)
            : file.withIncludeAll(false)
        })
      ),
      selection:
        changes.selection.kind === ChangesSelectionKind.WorkingDirectory
          ? { ...changes.selection, diff: null }
          : changes.selection,
    }))
    return needsReview
  }
  /** Restored authority for display verification, not mutable ownership. */
  public getRestored(selection: DiffSelection): IRestoredSelection | undefined {
    return this.restored.get(selection)
  }

  /** Original lineage retained for a user-selected diff mask. */
  public getBasis(selection: DiffSelection): ISelectionBasis | undefined {
    return this.bases.get(selection)
  }

  /** Transfer verified certificates to a derived display selection. */
  public inheritDisplaySelection(
    selection: DiffSelection,
    restored: IRestoredSelection | undefined,
    basis: ISelectionBasis | undefined
  ): void {
    if (restored !== undefined) {
      this.restored.set(selection, restored)
    }
    if (basis !== undefined) {
      this.bases.set(selection, basis)
    }
  }

  /** Record an explicit user line selection against its original displayed diff. */
  public recordLineSelection(
    repository: Repository,
    file: WorkingDirectoryFileChange,
    diffSelection: DiffSelection
  ): void {
    const state = this.cache.get(repository).changesState
    const displayed = state.selection
    const current = state.workingDirectory.findFileWithID(file.id)
    const basis =
      displayed.kind === ChangesSelectionKind.WorkingDirectory &&
      displayed.selectedFileIDs.length === 1 &&
      displayed.selectedFileIDs[0] === file.id &&
      displayed.diff !== null &&
      (displayed.diff.kind === DiffType.Text ||
        displayed.diff.kind === DiffType.LargeText)
        ? displayed.diff.text
        : current === null
        ? undefined
        : this.bases.get(current.selection)?.text
    const type = diffSelection.getSelectionType()
    if (type !== DiffSelectionType.None) {
      this.bases.set(diffSelection, {
        text: basis ?? null,
        sourceSelectionType: type,
      })
    } else {
      this.bases.delete(diffSelection)
    }
  }

  /** Preserve the exact branch and HEAD selected before assisted preflight. */
  public assertCapturedHead(
    run: IAssistedCommitSelectionSource,
    head: IAssistedCommitHead
  ): void {
    const tip = run.initialState.branchesState.tip
    const expected =
      tip.kind === TipState.Valid
        ? { ref: tip.branch.ref, sha: tip.branch.tip.sha }
        : tip.kind === TipState.Unborn
        ? {
            ref: tip.ref.startsWith('refs/heads/')
              ? tip.ref
              : `refs/heads/${tip.ref}`,
            sha: null,
          }
        : tip.kind === TipState.Detached
        ? { ref: null, sha: tip.currentSha }
        : undefined
    if (
      expected === undefined ||
      expected.ref !== head.ref ||
      expected.sha !== head.sha
    ) {
      throw new AssistedCommitError(
        'repository-changed',
        'The intended branch or HEAD changed before capture. Review the repository and try again.'
      )
    }
  }
}

/** Preserve the exact branch and HEAD selected before assisted preflight. */
export function assistedCommitHeadMatches(
  first: IRepositoryState['branchesState']['tip'],
  second: IRepositoryState['branchesState']['tip']
): boolean {
  if (first.kind !== second.kind) {
    return false
  }
  if (first.kind === TipState.Valid && second.kind === TipState.Valid) {
    return (
      first.branch.ref === second.branch.ref &&
      first.branch.tip.sha === second.branch.tip.sha
    )
  }
  if (first.kind === TipState.Unborn && second.kind === TipState.Unborn) {
    return first.ref === second.ref
  }
  if (first.kind === TipState.Detached && second.kind === TipState.Detached) {
    return first.currentSha === second.currentSha
  }
  return false
}
