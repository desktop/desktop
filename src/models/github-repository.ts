import Owner, {IOwner} from './owner'

/** The data-only interface for GitHubRepository for transport across IPC. */
export interface IGitHubRepository {
  name: string
  owner: IOwner
}

/** A GitHub repository. */
export default class GitHubRepository {
  private name: string
  private owner: Owner

  /** Create a new GitHubRepository from its data-only representation. */
  public static fromJSON(json: IGitHubRepository): GitHubRepository {
    return new GitHubRepository(json.name, Owner.fromJSON(json.owner))
  }

  public constructor(name: string, owner: Owner) {
    this.name = name
    this.owner = owner
  }

  public getName(): string {
    return this.name
  }

  public getOwner(): Owner {
    return this.owner
  }
}
