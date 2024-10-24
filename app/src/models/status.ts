import { DiffSelection, DiffSelectionType } from './diff'

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
  Untracked = 'Untracked',
}

/**
 * Normal changes to a repository detected by GitHub Desktop
 */
export type PlainFileStatus = {
  kind:
    | AppFileStatusKind.New
    | AppFileStatusKind.Modified
    | AppFileStatusKind.Deleted
  submoduleStatus?: SubmoduleStatus
}

/**
 * Copied or renamed files are change staged in the index that have a source
 * as well as a destination.
 *
 * The `oldPath` of a copied file also exists in the working directory, but the
 * `oldPath` of a renamed file will be missing from the working directory.
 */
export type CopiedOrRenamedFileStatus = {
  kind: AppFileStatusKind.Copied | AppFileStatusKind.Renamed
  oldPath: string
  renameIncludesModifications: boolean;
  submoduleStatus?: SubmoduleStatus
}

/**
 * Details about a file marked as conflicted in the index which may have
 * conflict markers to inspect.
 */
export type ConflictsWithMarkers = {
  kind: AppFileStatusKind.Conflicted
  entry: TextConflictEntry
  conflictMarkerCount: number
  submoduleStatus?: SubmoduleStatus
}

/**
 * Details about a file marked as conflicted in the index which needs to be
 * resolved manually by the user.
 */
export type ManualConflict = {
  kind: AppFileStatusKind.Conflicted
  entry: ManualConflictEntry
  submoduleStatus?: SubmoduleStatus
}

/** Union of potential conflict scenarios the application should handle */
export type ConflictedFileStatus = ConflictsWithMarkers | ManualConflict

/** Custom typeguard to differentiate Conflict files from other types */
export function isConflictedFileStatus(
  appFileStatus: AppFileStatus
): appFileStatus is ConflictedFileStatus {
  return appFileStatus.kind === AppFileStatusKind.Conflicted
}

/** Custom typeguard to differentiate ConflictsWithMarkers from other Conflict types */
export function isConflictWithMarkers(
  conflictedFileStatus: ConflictedFileStatus
): conflictedFileStatus is ConflictsWithMarkers {
  return conflictedFileStatus.hasOwnProperty('conflictMarkerCount')
}

/** Custom typeguard to differentiate ManualConflict from other Conflict types */
export function isManualConflict(
  conflictedFileStatus: ConflictedFileStatus
): conflictedFileStatus is ManualConflict {
  return !conflictedFileStatus.hasOwnProperty('conflictMarkerCount')
}

/** Denotes an untracked file in the working directory) */
export type UntrackedFileStatus = {
  kind: AppFileStatusKind.Untracked
  submoduleStatus?: SubmoduleStatus
}

/** The union of potential states associated with a file change in Desktop */
export type AppFileStatus =
  | PlainFileStatus
  | CopiedOrRenamedFileStatus
  | ConflictedFileStatus
  | UntrackedFileStatus

/** The status of a submodule */
export type SubmoduleStatus = {
  /** Whether or not the submodule is pointing to a different commit */
  readonly commitChanged: boolean
  /**
   * Whether or not the submodule contains modified changes that haven't been
   * committed yet
   */
  readonly modifiedChanges: boolean
  /**
   * Whether or not the submodule contains untracked changes that haven't been
   * committed yet
   */
  readonly untrackedChanges: boolean
}

/** The porcelain status for an ordinary changed entry */
type OrdinaryEntry = {
  readonly kind: 'ordinary'
  /** how we should represent the file in the application */
  readonly type: 'added' | 'modified' | 'deleted'
  /** the status of the index for this entry (if known) */
  readonly index?: GitStatusEntry
  /** the status of the working tree for this entry (if known) */
  readonly workingTree?: GitStatusEntry
  /** the submodule status for this entry */
  readonly submoduleStatus?: SubmoduleStatus
}

/** The porcelain status for a renamed or copied entry */
type RenamedOrCopiedEntry = {
  readonly kind: 'renamed' | 'copied'
  /** the status of the index for this entry (if known) */
  readonly index?: GitStatusEntry
  /** the status of the working tree for this entry (if known) */
  readonly workingTree?: GitStatusEntry
  /** the submodule status for this entry */
  readonly submoduleStatus?: SubmoduleStatus
  /** The rename or copy score in the case of a renamed file */
  readonly renameOrCopyScore?: number
}

export enum UnmergedEntrySummary {
  AddedByUs = 'added-by-us',
  DeletedByUs = 'deleted-by-us',
  AddedByThem = 'added-by-them',
  DeletedByThem = 'deleted-by-them',
  BothDeleted = 'both-deleted',
  BothAdded = 'both-added',
  BothModified = 'both-modified',
}

/**
 * Valid Git index states that the application should detect text conflict
 * markers
 */
type TextConflictDetails =
  | {
      readonly action: UnmergedEntrySummary.BothAdded
      readonly us: GitStatusEntry.Added
      readonly them: GitStatusEntry.Added
    }
  | {
      readonly action: UnmergedEntrySummary.BothModified
      readonly us: GitStatusEntry.UpdatedButUnmerged
      readonly them: GitStatusEntry.UpdatedButUnmerged
    }

type TextConflictEntry = {
  readonly kind: 'conflicted'
  /** the submodule status for this entry */
  readonly submoduleStatus?: SubmoduleStatus
} & TextConflictDetails

/**
 * Valid Git index states where the user needs to choose one of `us` or `them`
 * in the app.
 */
type ManualConflictDetails = {
  /** the submodule status for this entry */
  readonly submoduleStatus?: SubmoduleStatus
} & (
  | {
      readonly action: UnmergedEntrySummary.BothAdded
      readonly us: GitStatusEntry.Added
      readonly them: GitStatusEntry.Added
    }
  | {
      readonly action: UnmergedEntrySummary.BothModified
      readonly us: GitStatusEntry.UpdatedButUnmerged
      readonly them: GitStatusEntry.UpdatedButUnmerged
    }
  | {
      readonly action: UnmergedEntrySummary.AddedByUs
      readonly us: GitStatusEntry.Added
      readonly them: GitStatusEntry.UpdatedButUnmerged
    }
  | {
      readonly action: UnmergedEntrySummary.DeletedByThem
      readonly us: GitStatusEntry.UpdatedButUnmerged
      readonly them: GitStatusEntry.Deleted
    }
  | {
      readonly action: UnmergedEntrySummary.AddedByThem
      readonly us: GitStatusEntry.UpdatedButUnmerged
      readonly them: GitStatusEntry.Added
    }
  | {
      readonly action: UnmergedEntrySummary.DeletedByUs
      readonly us: GitStatusEntry.Deleted
      readonly them: GitStatusEntry.UpdatedButUnmerged
    }
  | {
      readonly action: UnmergedEntrySummary.BothDeleted
      readonly us: GitStatusEntry.Deleted
      readonly them: GitStatusEntry.Deleted
    }
)

type ManualConflictEntry = {
  readonly kind: 'conflicted'
  /** the submodule status for this entry */
  readonly submoduleStatus?: SubmoduleStatus
} & ManualConflictDetails

/** The porcelain status for an unmerged entry */
export type UnmergedEntry = TextConflictEntry | ManualConflictEntry

/** The porcelain status for an unmerged entry */
type UntrackedEntry = {
  readonly kind: 'untracked'
  /** the submodule status for this entry */
  readonly submoduleStatus?: SubmoduleStatus
}

/** The union of possible entries from the git status */
export type FileEntry =
  | OrdinaryEntry
  | RenamedOrCopiedEntry
  | UnmergedEntry
  | UntrackedEntry

/** encapsulate changes to a file associated with a commit */
export class FileChange {
  /** An ID for the file change. */
  public readonly id: string

  /**
   * @param path The relative path to the file in the repository.
   * @param status The status of the change to the file.
   */
  public constructor(
    public readonly path: string,
    public readonly status: AppFileStatus
  ) {
    if (
      status.kind === AppFileStatusKind.Renamed ||
      status.kind === AppFileStatusKind.Copied
    ) {
      this.id = `${status.kind}+${path}+${status.oldPath}`
    } else {
      this.id = `${status.kind}+${path}`
    }
  }
}

/** encapsulate the changes to a file in the working directory */
export class WorkingDirectoryFileChange extends FileChange {
  /**
   * @param path The relative path to the file in the repository.
   * @param status The status of the change to the file.
   * @param selection Contains the selection details for this file - all, nothing or partial.
   * @param oldPath The original path in the case of a renamed file.
   */
  public constructor(
    path: string,
    status: AppFileStatus,
    public readonly selection: DiffSelection
  ) {
    super(path, status)
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
    return new WorkingDirectoryFileChange(this.path, this.status, selection)
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
    public readonly parentCommitish: string
  ) {
    super(path, status)

    this.commitish = commitish
  }
}

/** the state of the working directory for a repository */
export class WorkingDirectoryStatus {
  /** Create a new status with the given files. */
  public static fromFiles(
    files: ReadonlyArray<WorkingDirectoryFileChange>
  ): WorkingDirectoryStatus {
    return new WorkingDirectoryStatus(files, getIncludeAllState(files))
  }

  private readonly fileIxById = new Map<string, number>()
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
