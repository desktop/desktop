import * as Path from 'path'

let CloningRepositoryID = 1

/** A repository which is currently being cloned. */
export class CloningRepository {
  public readonly id = CloningRepositoryID++
  public readonly path: string
  public readonly url: string
  public readonly remoteName: string

  public constructor(path: string, url: string, remoteName: string) {
    this.path = path
    this.url = url
    this.remoteName = remoteName
  }

  public get name(): string {
    if(this.remoteName == "") {
      return Path.basename(this.path)
    } else {
      return this.remoteName
    }
  }

  /**
   * A hash of the properties of the object.
   *
   * Objects with the same hash are guaranteed to be structurally equal.
   */
  public get hash(): string {
    return `${this.id}+${this.path}+${this.url}+${this.remoteName}`
  }
}
