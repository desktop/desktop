export enum SubmoduleWorkingTreeState {
  Clean = 'clean',
  Uninitialized = 'uninitialized',
  CommitChanged = 'commit-changed',
  Conflicted = 'conflicted',
}

export class SubmoduleEntry {
  public constructor(
    public readonly sha: string,
    public readonly path: string,
    public readonly describe: string,
    public readonly workingTreeState: SubmoduleWorkingTreeState = SubmoduleWorkingTreeState.Clean
  ) {}

  public isEqualTo(other: SubmoduleEntry): boolean {
    return (
      this.sha === other.sha &&
      this.path === other.path &&
      this.describe === other.describe &&
      this.workingTreeState === other.workingTreeState
    )
  }
}
