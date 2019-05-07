import { Commit } from './commit'
import { removeRemotePrefix } from '../lib/remove-remote-prefix'

// NOTE: The values here matter as they are used to sort
// local and remote branches, Local should come before Remote
export enum BranchType {
  Local = 0,
  Remote = 1,
}

/** The number of commits a revision range is ahead/behind. */
export interface IAheadBehind {
  readonly ahead: number
  readonly behind: number
}

/** The result of comparing two refs in a repository. */
export interface ICompareResult extends IAheadBehind {
  readonly commits: ReadonlyArray<Commit>
}

/** Default rules for where to create a branch from */
export enum StartPoint {
  CurrentBranch = 'CurrentBranch',
  DefaultBranch = 'DefaultBranch',
  Head = 'Head',
}

/**
 * Check if a branch is eligible for beign fast forarded.
 *
 * Requirements:
 *   1. It's local.
 *   2. It's not the current branch.
 *   3. It has an upstream.
 *
 * @param branch The branch to validate
 * @param currentBranchName The current branch in the repository
 */
export function eligibleForFastForward(
  branch: Branch,
  currentBranchName: string | null
): boolean {
  return (
    branch.type === BranchType.Local &&
    branch.name !== currentBranchName &&
    branch.upstream != null
  )
}

/** A branch as loaded from Git. */
export class Branch {
  /**
   * A branch as loaded from Git.
   *
   * @param name The short name of the branch. E.g., `master`.
   * @param upstream The remote-prefixed upstream name. E.g., `origin/master`.
   * @param tip The commit associated with this branch
   * @param type The type of branch, e.g., local or remote.
   */
  public constructor(
    public readonly name: string,
    public readonly upstream: string | null,
    public readonly sha: string,
    public readonly shortSha: string,
    public readonly lastCommitDate: Date,
    public readonly type: BranchType
  ) {}

  /** The name of the upstream's remote. */
  public get remote(): string | null {
    const upstream = this.upstream
    if (!upstream) {
      return null
    }

    const pieces = upstream.match(/(.*?)\/.*/)
    if (!pieces || pieces.length < 2) {
      return null
    }

    return pieces[1]
  }

  /**
   * The name of the branch's upstream without the remote prefix.
   */
  public get upstreamWithoutRemote(): string | null {
    if (!this.upstream) {
      return null
    }

    return removeRemotePrefix(this.upstream)
  }

  /**
   * The name of the branch without the remote prefix. If the branch is a local
   * branch, this is the same as its `name`.
   */
  public get nameWithoutRemote(): string {
    if (this.type === BranchType.Local) {
      return this.name
    } else {
      const withoutRemote = removeRemotePrefix(this.name)
      return withoutRemote || this.name
    }
  }
}
