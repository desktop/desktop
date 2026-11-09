import { WorkingDirectoryFileChange } from './status'

/** The complete original HEAD identity, including unborn and detached HEADs. */
export interface IAssistedCommitHead {
  /** The fully qualified branch, or null for a detached HEAD. */
  readonly ref: string | null
  /** The full commit object ID, or null for an unborn branch. */
  readonly sha: string | null
}

/**
 * An indivisible, snapshot-owned selection unit.
 *
 * Diff text is for analysis only. A planner may return IDs, never replacement
 * paths, patches, modes, or object IDs.
 */
export interface IAssistedCommitChange {
  /** An opaque ID valid only within this snapshot. */
  readonly id: string
  /** Whether this is one text hunk or an atomic file change. */
  readonly kind: 'text-hunk' | 'atomic'
  /** The repository-relative selected path. */
  readonly path: string
  /** The original path for an atomic rename or copy. */
  readonly oldPath?: string
  /** A diff containing selected changes and original, unchanged context only. */
  readonly diff: string
}

/** The selected-only view that may be supplied to a planner. */
export interface IAssistedCommitAnalysis {
  /** The identity that a proposed plan must echo. */
  readonly snapshotId: string
  /** All selected change units, with no live working-tree inputs. */
  readonly changes: ReadonlyArray<IAssistedCommitChange>
}

/**
 * A Desktop-owned immutable selection snapshot.
 *
 * Use withAssistedCommitSnapshot to scope its temporary resources. This object
 * is not a serializable executor capability: the engine also checks its identity.
 */
export interface IAssistedCommitSnapshot {
  /** The opaque snapshot identity. */
  readonly id: string
  /** The Desktop repository ID at capture. */
  readonly repositoryId: number
  /** The resolved repository root at capture. */
  readonly repositoryPath: string
  /** The full original HEAD identity. */
  readonly originalHead: IAssistedCommitHead
  /** The exact tree containing the frozen selected changes. */
  readonly selectedTree: string
  /** The only snapshot view intended for model analysis. */
  readonly analysis: IAssistedCommitAnalysis
  /**
   * Original file/line selections for caller-owned UI recovery.
   *
   * On selected-content mutation, refresh diffs before reconciling these line
   * indices. The engine never reapplies old bytes or selections to the worktree.
   */
  readonly originalSelection: ReadonlyArray<WorkingDirectoryFileChange>
}

/** One proposed commit. Content comes exclusively from snapshot change IDs. */
export interface IAssistedCommitPlanCommit {
  /** A required nonblank, single-line commit title. */
  readonly title: string
  /** An optional commit description. */
  readonly description?: string
  /** Exact ownership of one or more selected units. */
  readonly changeIds: ReadonlyArray<string>
}

/**
 * The complete planner output, validated before any real ref or index change.
 *
 * Every selected ID must occur exactly once. Extra properties are rejected.
 */
export interface IAssistedCommitPlan {
  /** The snapshot against which this plan was generated. */
  readonly snapshotId: string
  /** Ordered, exhaustive commit groups. */
  readonly commits: ReadonlyArray<IAssistedCommitPlanCommit>
}

/**
 * An explicit single-commit fallback request.
 *
 * The caller must supply a new message covering the entire selection, not reuse
 * the first title of an unsafe multi-commit plan. Invalid plans are never a
 * reason to fall back.
 */
export interface IAssistedCommitSingleCommit {
  /** Why the caller chose one commit rather than a split. */
  readonly reason: 'uncertain-boundaries' | 'unsafe-split' | 'empty-selection'
  /** A nonblank title accurately describing the entire selection. */
  readonly title: string
  /** An optional description covering the entire selection. */
  readonly description?: string
}

/** A checked plan with every cumulative tree materialized by Desktop. */
export interface IValidatedAssistedCommitPlan {
  /** The immutable validated proposal. */
  readonly plan: IAssistedCommitPlan
  /** Full, cumulative tree object IDs, one per proposed commit. */
  readonly trees: ReadonlyArray<string>
}
