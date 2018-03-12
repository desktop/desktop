export class SubmoduleEntry {
  public readonly sha: string
  public readonly path: string
  public readonly describe: string
  /**
   * This property can have four possible states:
   *   - " " if no change
   *   - "-" if the submodule is not initialized
   *   - "+" if the currently checked out submodule commit does not match the SHA-1 found in the index of the containing repository
   *   - "U" if the submodule has merge conflicts
   */
  public readonly state: string

  public constructor(
    sha: string,
    path: string,
    describe: string,
    state: string
  ) {
    if (![' ', '-', '+', 'U'].includes(state)) {
      throw new Error(`state ${state} not recognized`)
    }
    this.state = state
    this.sha = sha
    this.path = path
    this.describe = describe
  }
}
