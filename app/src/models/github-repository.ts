import { Owner } from './owner'
import { IAPIRepository } from '../lib/api'

/** A GitHub repository. */
export class GitHubRepository {
  /**
   * The ID of the repository in the app's local database. This is no relation
   * to the API ID.
   */
  public readonly dbID: number

  public readonly name: string
  public readonly owner: Owner
  public readonly private: boolean
  public readonly fork: boolean
  public readonly htmlURL: string
  public readonly defaultBranch: string
  public readonly cloneURL: string
  public readonly parent: GitHubRepository | null

  public constructor(
    name: string,
    owner: Owner,
    dbID: number,
    private_: boolean,
    fork: boolean,
    htmlURL: string,
    defaultBranch: string,
    cloneURL: string,
    parent: GitHubRepository | null
  ) {
    this.name = name
    this.owner = owner
    this.dbID = dbID
    this.private = private_
    this.fork = fork
    this.htmlURL = htmlURL
    this.defaultBranch = defaultBranch
    this.cloneURL = cloneURL
    this.parent = parent
  }

  /** Create a new copy of the repository with the API information copied over. */
  public withAPI(apiRepository: IAPIRepository): GitHubRepository {
    let parent = null
    if (apiRepository.parent) {
      if (this.parent) {
        parent = this.parent.withAPI(apiRepository.parent)
      } else {
        parent = new GitHubRepository(apiRepository)
      }
    }

    const newRepository = new GitHubRepository(
      apiRepository.name,
      this.owner,
      this.dbID,
      apiRepository.private,
      apiRepository.fork,
      apiRepository.html_url,
      apiRepository.default_branch,
      apiRepository.clone_url,
      parent
    )

    return newRepository.hash === this.hash ? this : newRepository
  }

  public get endpoint(): string {
    return this.owner.endpoint
  }

  /** Get the owner/name combo. */
  public get fullName(): string {
    return `${this.owner.login}/${this.name}`
  }

  /**
   * A hash of the properties of the object.
   *
   * Objects with the same hash are guaranteed to be structurally equal.
   */
  public get hash(): string {
    return `${this.dbID}+
      ${this.defaultBranch}+
      ${this.private}+
      ${this.cloneURL}+
      ${this.fork}+
      ${this.name}+
      ${this.htmlURL}+
      ${this.owner.hash}+
      ${this.parent && this.parent.hash}`
  }
}
