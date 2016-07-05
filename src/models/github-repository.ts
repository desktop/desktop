import Owner, {IOwner} from './owner'

/** The data-only interface for GitHubRepository for transport across IPC. */
export interface IGitHubRepository {
  name: string
  owner: IOwner
  apiID: string
  cloneURL: string
  gitURL: string
  sshURL: string
  htmlURL: string
  dbID: number
}

/** A GitHub repository. */
export default class GitHubRepository {
  private name: string
  private owner: Owner
  private apiID: string
  private cloneURL: string
  private gitURL: string
  private sshURL: string
  private htmlURL: string
  private dbID: number

  /** Create a new GitHubRepository from its data-only representation. */
  public static fromJSON(json: IGitHubRepository): GitHubRepository {
    return new GitHubRepository(json.name, Owner.fromJSON(json.owner), json.apiID, json.cloneURL, json.gitURL, json.sshURL, json.htmlURL, json.dbID)
  }

  public constructor(name: string, owner: Owner, apiID: string, cloneURL: string, gitURL: string, sshURL: string, htmlURL: string, dbID: number) {
    this.name = name
    this.owner = owner
    this.apiID = apiID
    this.cloneURL = cloneURL
    this.gitURL = gitURL
    this.sshURL = sshURL
    this.htmlURL = htmlURL
    this.dbID = dbID
  }

  public getName(): string {
    return this.name
  }

  public getOwner(): Owner {
    return this.owner
  }

  public getAPIID(): string {
    return this.apiID
  }

  public getCloneURL(): string {
    return this.cloneURL
  }

  public getGitURL(): string {
    return this.gitURL
  }

  public getSSHURL(): string {
    return this.sshURL
  }

  public getHTMLURL(): string {
    return this.htmlURL
  }

  /**
   * Note: this will only be defined when the repository has been fetched from
   * the database.
   */
  public getDBID(): number {
    return this.dbID
  }
}
