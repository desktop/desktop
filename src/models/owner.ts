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
