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
export default class GitHubRepository implements IGitHubRepository {
  private _name: string
  private _owner: Owner
  private _apiID: string
  private _cloneURL: string
  private _gitURL: string
  private _sshURL: string
  private _htmlURL: string
  private _dbID: number

  /** Create a new GitHubRepository from its data-only representation. */
  public static fromJSON(json: IGitHubRepository): GitHubRepository {
    return new GitHubRepository(json.name, Owner.fromJSON(json.owner), json.apiID, json.cloneURL, json.gitURL, json.sshURL, json.htmlURL, json.dbID)
  }

  public constructor(name: string, owner: Owner, apiID: string, cloneURL: string, gitURL: string, sshURL: string, htmlURL: string, dbID?: number) {
    this._name = name
    this._owner = owner
    this._apiID = apiID
    this._cloneURL = cloneURL
    this._gitURL = gitURL
    this._sshURL = sshURL
    this._htmlURL = htmlURL
    this._dbID = dbID
  }

  public get name(): string { return this._name }
  public get owner(): Owner { return this._owner }
  public get apiID(): string { return this._apiID }
  public get cloneURL(): string { return this._cloneURL }
  public get gitURL(): string { return this._gitURL }
  public get sshURL(): string { return this._sshURL }
  public get htmlURL(): string { return this._htmlURL }

  /**
   * Note: this will only be defined when the repository has been fetched from
   * the database.
   */
  public get dbID(): number { return this._dbID }

  public get endpoint(): string { return this._owner.endpoint }
}
