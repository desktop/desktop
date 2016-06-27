export default class User {
  private token: string
  private login: string
  private endpoint: string

  public static fromJSON(obj: any): User {
    return new User(obj.login, obj.endpoint, obj.token)
  }

  public constructor(login: string, endpoint: string, token: string) {
    this.login = login
    this.endpoint = endpoint
    this.token = token
  }

  public getToken(): string {
    return this.token
  }

  public getLogin(): string {
    return this.login
  }

  public getEndpoint(): string {
    return this.endpoint
  }

  public userWithToken(token: string): User {
    return new User(this.login, this.endpoint, token)
  }
}
