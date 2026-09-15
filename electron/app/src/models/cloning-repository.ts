import * as Path from 'path'

/**
 * A sufficiently large number that it's unlikely it'll ever collide with the id
 * of a real repository which is auto-incremented in the database. If someone
 * adds more that 1M repos, all bets are off.
 */
let CloningRepositoryID = 1_000_000

/** A repository which is currently being cloned. */
export class CloningRepository {
  public readonly id = CloningRepositoryID++

  public constructor(
    public readonly path: string,
    public readonly url: string
  ) {}

  public get name(): string {
    return Path.basename(this.url, '.git')
  }

  /**
   * A hash of the properties of the object.
   *
   * Objects with the same hash are guaranteed to be structurally equal.
   */
  public get hash(): string {
    return `${this.id}+${this.path}+${this.url}`
  }
}
