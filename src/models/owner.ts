/** The data-only interface for Owner for transport across IPC. */
export interface IOwner {
  login: string
}

export default class Owner {
  public login: string

  public static fromJSON(json: IOwner): Owner {
    return new Owner(json.login)
  }

  public constructor(login: string) {
    this.login = login
  }
}
