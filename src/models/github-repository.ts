import Owner, {IOwner} from './owner'
import {APIRepository} from '../lib/api'

/** The data-only interface for GitHubRepository for transport across IPC. */
export interface IGitHubRepository {
  name: string
  owner: IOwner
  private: boolean
  fork: boolean
  htmlURL: string
}

/** A GitHub repository. */
export default class GitHubRepository {
  private name: string
  private owner: Owner
  private private: boolean
  private fork: boolean
  private htmlURL: string

  /** Create a new GitHubRepository from its data-only representation. */
  public static fromJSON(json: IGitHubRepository): GitHubRepository {
    return new GitHubRepository(json.name, Owner.fromJSON(json.owner), json.private, json.fork, json.htmlURL)
  }

  public constructor(name: string, owner: Owner, private_?: boolean, fork?: boolean, htmlURL?: string) {
    this.name = name
    this.owner = owner
    this.private = private_
    this.fork = fork
    this.htmlURL = htmlURL
  }

  /** Create a new copy of the repository with the API information copied over. */
  public gitHubRepositoryWithAPI(apiRepository: APIRepository): GitHubRepository {
    return new GitHubRepository(this.name, this.owner, apiRepository.private, apiRepository.fork, apiRepository.htmlUrl)
  }

  public getName(): string {
    return this.name
  }

  public getOwner(): Owner {
    return this.owner
  }

  public getEndpoint(): string {
    return this.owner.getEndpoint()
  }

  public getPrivate(): boolean {
    return this.private
  }

  public getFork(): boolean {
    return this.fork
  }

  public getHTMLURL(): string {
    return this.htmlURL
  }

  /** Get the owner/name combo. */
  public getFullName(): string {
    return `${this.owner.getLogin()}/${this.name}`
  }
}
