import * as Path from 'path'

let CloningRepositoryID = 1

/** A repository which is currently being cloned. */
export class CloningRepository {
  public readonly id = CloningRepositoryID++
  public readonly path: string
  public readonly url: string
  public readonly friendlyName: string

  public constructor(path: string, url: string, friendlyName: string) {
    this.path = path
    this.url = url
    this.friendlyName = friendlyName
  }

  public get name(): string {
    if (this.hasFriendlyName()) {
      return this.friendlyName
    }

    return this.basename
  }

  public get basename(): string {
    return Path.basename(this.path)
  }

  public hasFriendlyName(): boolean {
    return this.friendlyName.length > 0
  }

  /**
   * A hash of the properties of the object.
   *
   * Objects with the same hash are guaranteed to be structurally equal.
   */
  public get hash(): string {
    return `${this.id}+${this.path}+${this.url}+${this.friendlyName}`
  }
}
