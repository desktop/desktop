export default class User {
  public token: string
  public login: string

  public constructor(user: any, token: string) {
    this.login = user.login
    this.token = token
  }
}
