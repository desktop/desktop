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

  /** Create a new GitHubRepository from its data-only representation. */
  public static fromJSON(json: IGitHubRepository): GitHubRepository {
    return new GitHubRepository(json.name, Owner.fromJSON(json.owner), json.apiID, json.cloneURL, json.gitURL, json.sshURL, json.htmlURL)
  }

  public constructor(name: string, owner: Owner, apiID: string, cloneURL: string, gitURL: string, sshURL: string, htmlURL: string) {
    this.name = name
    this.owner = owner
    this.apiID = apiID
    this.cloneURL = cloneURL
    this.gitURL = gitURL
    this.sshURL = sshURL
    this.htmlURL = htmlURL
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
}
