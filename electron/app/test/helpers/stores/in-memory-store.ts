export class InMemoryStore {
  private store: { [key: string]: string }

  public constructor() {
    this.store = {}
  }

  private secureKey(key: string, login: string): string {
    return `__key/${key}/${login}`
  }

  public setItem(key: string, loginOrValue: string, secureValue?: string) {
    if (secureValue) {
      this.store[this.secureKey(key, loginOrValue)] = secureValue
    } else {
      this.store[key] = loginOrValue
    }
  }

  public getItem(key: string, login?: string): string {
    if (login) {
      return this.store[this.secureKey(key, login)]
    } else {
      return this.store[key]
    }
  }

  public deleteItem(key: string, login: string) {
    delete this.store[this.secureKey(key, login)]
  }
}
