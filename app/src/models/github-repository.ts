import { Owner, IOwner } from './owner'
import { IAPIRepository } from '../lib/api'
import { structuralEquals } from '../lib/equality'

/** The data-only interface for GitHubRepository for transport across IPC. */
export interface IGitHubRepository {
  readonly dbID: number | null
  readonly name: string
  readonly owner: IOwner
  readonly private: boolean | null
  readonly fork: boolean | null
  readonly htmlURL: string | null
  readonly defaultBranch: string | null
  readonly cloneURL: string | null
}

/** A GitHub repository. */
export class GitHubRepository implements IGitHubRepository {
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

  /** Create a new GitHubRepository from its data-only representation. */
  public static fromJSON(json: IGitHubRepository): GitHubRepository {
    return new GitHubRepository(json.name, Owner.fromJSON(json.owner), json.dbID, json.private, json.fork, json.htmlURL, json.defaultBranch, json.cloneURL)
  }

  public constructor(name: string, owner: Owner, dbID: number | null, private_: boolean | null = null, fork: boolean | null = null, htmlURL: string | null = null, defaultBranch: string | null = 'master', cloneURL: string | null = null) {
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
    const newRepository = new GitHubRepository(this.name, this.owner, this.dbID, apiRepository.private, apiRepository.fork, apiRepository.html_url, apiRepository.default_branch, apiRepository.clone_url)

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
