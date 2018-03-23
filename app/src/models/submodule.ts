/**
 * This property defines the four possible submodule states:
 *   - " " if no change
 *   - "-" if the submodule is not initialized
 *   - "+" if the currently checked out submodule commit does not match the SHA-1 found in the index of the containing repository
 *   - "U" if the submodule has merge conflicts
 */
export const SubmoduleState = {
  NO_CHANGE: ' ',
  NOT_INIT: '-',
  NOT_UPDATED: '+',
  MERGE_CONFLICT: 'U',
}

export class SubmoduleEntry {
  public readonly sha: string
  public readonly path: string
  public readonly describe: string
  public readonly state: string

  public constructor(
    sha: string,
    path: string,
    describe: string,
    state: string
  ) {
    if (![' ', '-', '+', 'U'].includes(state)) {
      throw new Error(`submodule state "${state}" not recognized`)
    }
    this.state = state
    this.sha = sha
    this.path = path
    this.describe = describe
  }
}
