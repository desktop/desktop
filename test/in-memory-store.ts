export default class InMemoryStore {
  private store: {[key: string]: string}
  private secureStore: {[key: string]: string}

  public constructor() {
    this.store = {}
    this.secureStore = {}
  }

  private secureKey(key: string, login: string): string {
    return `__key/${key}/${login}`
  }

  public setItem(key: string, loginOrValue: string, secureValue?: string) {
    if (secureValue) {
      this.secureStore[this.secureKey(key, loginOrValue)] = secureValue
    } else {
      this.store[key] = loginOrValue
    }
  }

  public getItem(key: string, login?: string): string {
    if (login) {
      return this.secureStore[this.secureKey(key, login)]
    } else {
      return this.store[key]
    }
  }
}
