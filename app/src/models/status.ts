import { DiffSelection, DiffSelectionType } from './diff'
import { OcticonSymbol } from '../ui/octicons'
import { assertNever } from '../lib/fatal-error'
import { ConflictFileStatus } from './conflicts'

/**
 * The status entry code as reported by Git.
 */
export enum GitStatusEntry {
  Modified = 'M',
  Added = 'A',
  Deleted = 'D',
  Renamed = 'R',
  Copied = 'C',
  Unchanged = '.',
  Untracked = '?',
  Ignored = '!',
  //
  // While U is a valid code here, we currently mark conflicts as "Modified"
  // in the application - this will likely be something we need to revisit
  // down the track as we improve our merge conflict experience
  UpdatedButUnmerged = 'U',
}

/** The enum representation of a Git file change in GitHub Desktop. */
export enum AppFileStatusKind {
  New = 'New',
  Modified = 'Modified',
  Deleted = 'Deleted',
  Copied = 'Copied',
  Renamed = 'Renamed',
  Conflicted = 'Conflicted',
  Resolved = 'Resolved',
}

/** The state of a GitHub Desktop-specific change containing additional metadata */
export type PlainFileStatus = {
  kind:
    | AppFileStatusKind.New
    | AppFileStatusKind.Modified
    | AppFileStatusKind.Deleted
    // TODO: where should this live?
    | AppFileStatusKind.Resolved
}

export type CopiedOrRenamedFileStatus = {
  kind: AppFileStatusKind.Copied | AppFileStatusKind.Renamed
  oldPath: string
}

export type ConflictedFileStatus = {
  kind: AppFileStatusKind.Conflicted
  conflictStatus: ConflictFileStatus
}

export type AppFileStatus =
  | PlainFileStatus
  | CopiedOrRenamedFileStatus
  | ConflictedFileStatus

/** The porcelain status for an ordinary changed entry */
type OrdinaryEntry = {
  readonly kind: 'ordinary'
  /** how we should represent the file in the application */
  readonly type: 'added' | 'modified' | 'deleted'
  /** the status of the index for this entry (if known) */
  readonly index?: GitStatusEntry
  /** the status of the working tree for this entry (if known) */
  readonly workingTree?: GitStatusEntry
}

/** The porcelain status for a renamed or copied entry */
type RenamedOrCopiedEntry = {
  readonly kind: 'renamed' | 'copied'
  /** the status of the index for this entry (if known) */
  readonly index?: GitStatusEntry
  /** the status of the working tree for this entry (if known) */
  readonly workingTree?: GitStatusEntry
}

/** The porcelain status for an unmerged entry */
export type UnmergedEntry = {
  readonly kind: 'conflicted'
  /** the first character of the short code ("ours")  */
  readonly us: GitStatusEntry
  /** the second character of the short code ("theirs")  */
  readonly them: GitStatusEntry
}

/** The porcelain status for an unmerged entry */
type UntrackedEntry = {
  readonly kind: 'untracked'
}

/** The union of possible entries from the git status */
export type FileEntry =
  | OrdinaryEntry
  | RenamedOrCopiedEntry
  | UnmergedEntry
  | UntrackedEntry

/**
 * Convert a given FileStatus value to a human-readable string to be
 * presented to users which describes the state of a file.
 *
 * Typically this will be the same value as that of the enum key.
 *
 * Used in file lists.
 */
export function mapStatus(status: AppFileStatusKind): string {
  switch (status) {
    case AppFileStatusKind.New:
      return 'New'
    case AppFileStatusKind.Modified:
      return 'Modified'
    case AppFileStatusKind.Deleted:
      return 'Deleted'
    case AppFileStatusKind.Renamed:
      return 'Renamed'
    case AppFileStatusKind.Conflicted:
      return 'Conflicted'
    case AppFileStatusKind.Resolved:
      return 'Resolved'
    case AppFileStatusKind.Copied:
      return 'Copied'
  }

  return assertNever(status, `Unknown file status ${status}`)
}

/**
 * Converts a given FileStatus value to an Octicon symbol
 * presented to users when displaying the file path.
 *
 * Used in file lists.
 */
export function iconForStatus(status: AppFileStatusKind): OcticonSymbol {
  switch (status) {
    case AppFileStatusKind.New:
      return OcticonSymbol.diffAdded
    case AppFileStatusKind.Modified:
      return OcticonSymbol.diffModified
    case AppFileStatusKind.Deleted:
      return OcticonSymbol.diffRemoved
    case AppFileStatusKind.Renamed:
      return OcticonSymbol.diffRenamed
    case AppFileStatusKind.Conflicted:
      return OcticonSymbol.alert
    case AppFileStatusKind.Resolved:
      return OcticonSymbol.check
    case AppFileStatusKind.Copied:
      return OcticonSymbol.diffAdded
  }

  return assertNever(status, `Unknown file status ${status}`)
}

/** encapsulate changes to a file associated with a commit */
export class FileChange {
  /** An ID for the file change. */
  public readonly id: string

  /**
   * @param path The relative path to the file in the repository.
   * @param status The status of the change to the file.
   * @param oldPath The original path in the case of a renamed file.
   */
  public constructor(
    public readonly path: string,
    public readonly status: AppFileStatus,
    public readonly oldPath?: string
  ) {
    this.id = `${this.status.kind}+${this.path}`
  }
}

/** encapsulate the changes to a file in the working directory */
export class WorkingDirectoryFileChange extends FileChange {
  /**
   * @param path The relative path to the file in the repository.
   * @param status The status of the change to the file.
   * @param selection Contains the selection details for this file - all, nothing or partial.
   * @param oldPath The original path in the case of a renamed file.
   * @param conflictMarkers The number of conflict markers found in this file
   */
  public constructor(
    path: string,
    status: AppFileStatus,
    public readonly selection: DiffSelection,
    oldPath?: string,
    public readonly conflictStatus: ConflictFileStatus | null = null
  ) {
    super(path, status, oldPath)
  }

  /** Create a new WorkingDirectoryFileChange with the given includedness. */
  public withIncludeAll(include: boolean): WorkingDirectoryFileChange {
    const newSelection = include
      ? this.selection.withSelectAll()
      : this.selection.withSelectNone()

    return this.withSelection(newSelection)
  }

  /** Create a new WorkingDirectoryFileChange with the given diff selection. */
  public withSelection(selection: DiffSelection): WorkingDirectoryFileChange {
    return new WorkingDirectoryFileChange(
      this.path,
      this.status,
      selection,
      this.oldPath,
      this.conflictStatus
    )
  }
}

/**
 * An object encapsulating the changes to a committed file.
 *
 * @param status A commit SHA or some other identifier that ultimately
 *               dereferences to a commit. This is the pointer to the
 *               'after' version of this change. I.e. the parent of this
 *               commit will contain the 'before' (or nothing, if the
 *               file change represents a new file).
 */
export class CommittedFileChange extends FileChange {
  public constructor(
    path: string,
    status: AppFileStatus,
    public readonly commitish: string,
    oldPath?: string
  ) {
    super(path, status, oldPath)

    this.commitish = commitish
  }
}

/** the state of the working directory for a repository */
export class WorkingDirectoryStatus {
  private readonly fileIxById = new Map<string, number>()

  /** Create a new status with the given files. */
  public static fromFiles(
    files: ReadonlyArray<WorkingDirectoryFileChange>
  ): WorkingDirectoryStatus {
    return new WorkingDirectoryStatus(files, getIncludeAllState(files))
  }

  /**
   * @param files The list of changes in the repository's working directory.
   * @param includeAll Update the include checkbox state of the form.
   *                   NOTE: we need to track this separately to the file list selection
   *                         and perform two-way binding manually when this changes.
   */
  private constructor(
    public readonly files: ReadonlyArray<WorkingDirectoryFileChange>,
    public readonly includeAll: boolean | null = true
  ) {
    files.forEach((f, ix) => this.fileIxById.set(f.id, ix))
  }

  /**
   * Update the include state of all files in the working directory
   */
  public withIncludeAllFiles(includeAll: boolean): WorkingDirectoryStatus {
    const newFiles = this.files.map(f => f.withIncludeAll(includeAll))
    return new WorkingDirectoryStatus(newFiles, includeAll)
  }

  /** Find the file with the given ID. */
  public findFileWithID(id: string): WorkingDirectoryFileChange | null {
    const ix = this.fileIxById.get(id)
    return ix !== undefined ? this.files[ix] || null : null
  }

  /** Find the index of the file with the given ID. Returns -1 if not found */
  public findFileIndexByID(id: string): number {
    const ix = this.fileIxById.get(id)
    return ix !== undefined ? ix : -1
  }
}

function getIncludeAllState(
  files: ReadonlyArray<WorkingDirectoryFileChange>
): boolean | null {
  if (!files.length) {
    return true
  }

  const allSelected = files.every(
    f => f.selection.getSelectionType() === DiffSelectionType.All
  )
  const noneSelected = files.every(
    f => f.selection.getSelectionType() === DiffSelectionType.None
  )

  let includeAll: boolean | null = null
  if (allSelected) {
    includeAll = true
  } else if (noneSelected) {
    includeAll = false
  }

  return includeAll
}
