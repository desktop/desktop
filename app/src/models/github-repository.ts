import { Owner } from './owner'
import { IAPIRepository } from '../lib/api'
import { structuralEquals } from '../lib/equality'

/** A GitHub repository. */
export class GitHubRepository {
  /**
   * The ID of the repository in the app's local database. This is no relation
   * to the API ID.
   *
   * May be `null` if it hasn't been inserted or retrieved from the database.
   */
  public readonly dbID: number | null

  public readonly name: string
  public readonly owner: Owner
  public readonly private: boolean | null
  public readonly fork: boolean | null
  public readonly htmlURL: string | null
  public readonly defaultBranch: string | null
  public readonly cloneURL: string | null

  public constructor(
    name: string,
    owner: Owner,
    dbID: number | null,
    private_: boolean | null = null,
    fork: boolean | null = null,
    htmlURL: string | null = null,
    defaultBranch: string | null = 'master',
    cloneURL: string | null = null
  ) {
    this.name = name
    this.owner = owner
    this.dbID = dbID
    this.private = private_
    this.fork = fork
    this.htmlURL = htmlURL
    this.defaultBranch = defaultBranch
    this.cloneURL = cloneURL
  }

  /** Create a new copy of the repository with the API information copied over. */
  public withAPI(apiRepository: IAPIRepository): GitHubRepository {
    const newRepository = new GitHubRepository(
      this.name,
      this.owner,
      this.dbID,
      apiRepository.private,
      apiRepository.fork,
      apiRepository.html_url,
      apiRepository.default_branch,
      apiRepository.clone_url
    )

    return structuralEquals(newRepository, this) ? this : newRepository
  }

  public get endpoint(): string {
    return this.owner.endpoint
  }

  /** Get the owner/name combo. */
  public get fullName(): string {
    return `${this.owner.login}/${this.name}`
  }
}
