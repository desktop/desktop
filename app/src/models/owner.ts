import { GitHubAccountType } from '../lib/api'

/** The owner of a GitHubRepository. */
export class Owner {
  /**
   * @param id The database ID. This may be null if the object wasn't retrieved from the database.
   */
  public constructor(
    public readonly login: string,
    public readonly endpoint: string,
    public readonly id: number,
    public readonly type?: GitHubAccountType
  ) {}
}
