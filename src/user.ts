export default class User {
  public token: string
  public login: string
  public server: string

  public constructor(login: string, token: string) {
    this.login = login
    this.token = token
  }
}
