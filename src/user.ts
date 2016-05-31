export default class User {
  public token: string
  public login: string
  public endpoint: string

  public constructor(login: string, token: string) {
    this.login = login
    this.token = token
  }
}
