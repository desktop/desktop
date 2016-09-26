import * as keytar from 'keytar'

export class TokenStore {
  public static setItem(key: string, login: string, value: string) {
    keytar.addPassword(key, login, value)
  }

  public static getItem(key: string, login: string): string {
      return keytar.getPassword(key, login)
  }
}
