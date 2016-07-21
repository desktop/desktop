import Owner, {IOwner} from './owner'
import {IAPIRepository} from '../lib/api'

/** The data-only interface for GitHubRepository for transport across IPC. */
export interface IGitHubRepository {
  readonly name: string
  readonly owner: IOwner
  readonly private: boolean | null
  readonly fork: boolean | null
  readonly htmlURL: string | null
}

/** A GitHub repository. */
export default class GitHubRepository implements IGitHubRepository {
  public readonly name: string
  public readonly owner: Owner
  public readonly private: boolean | null
  public readonly fork: boolean | null
  public readonly htmlURL: string | null

  /** Create a new GitHubRepository from its data-only representation. */
  public static fromJSON(json: IGitHubRepository): GitHubRepository {
    return new GitHubRepository(json.name, Owner.fromJSON(json.owner), json.private, json.fork, json.htmlURL)
  }

  public constructor(name: string, owner: Owner, private_: boolean | null = null, fork: boolean | null = null, htmlURL: string | null = null) {
    this.name = name
    this.owner = owner
    this.private = private_
    this.fork = fork
    this.htmlURL = htmlURL
  }

  /** Create a new copy of the repository with the API information copied over. */
  public withAPI(apiRepository: IAPIRepository): GitHubRepository {
    return new GitHubRepository(this.name, this.owner, apiRepository.private, apiRepository.fork, apiRepository.htmlUrl)
  }

  public get endpoint(): string {
    return this.owner.endpoint
  }

  /** Get the owner/name combo. */
  public get fullName(): string {
    return `${this.owner.login}/${this.name}`
  }
}
