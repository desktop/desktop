/** The data-only interface for Repository. For transport across IPC and storage. */
export interface IRepository {

}

/**
 * A local repository.
 */
export default class Repository {
  public static fromJSON(json: IRepository): Repository {
    return new Repository()
  }
}
