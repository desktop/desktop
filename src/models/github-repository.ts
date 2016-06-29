import Owner from './owner'

export default class GitHubRepository {
  public name: string
  public owner: Owner

  public static fromJSON(json: any): GitHubRepository {
    return new GitHubRepository(json.name, Owner.fromJSON(json.owner))
  }

  public constructor(name: string, owner: Owner) {
    this.name = name
    this.owner = owner
  }
}
