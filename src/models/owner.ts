export default class Owner {
  public login: string

  public static fromJSON(json: any): Owner {
    return new Owner(json.login)
  }

  public constructor(login: string) {
    this.login = login
  }
}
