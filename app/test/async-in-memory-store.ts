
export class AsyncInMemoryStore {
  private store: {[key: string]: string}

  public constructor() {
    this.store = {}
  }

  private secureKey(key: string, login: string): string {
    return `__key/${key}/${login}`
  }

  public setItem(key: string, loginOrValue: string, secureValue?: string): Promise<void> {
    if (secureValue) {
      this.store[this.secureKey(key, loginOrValue)] = secureValue
    } else {
      this.store[key] = loginOrValue
    }

    return Promise.resolve()
  }

  public getItem(key: string, login?: string): Promise<string | null> {
    if (login) {
      return Promise.resolve(this.store[this.secureKey(key, login)])
    } else {
      return Promise.resolve(this.store[key])
    }
  }

  public deleteItem(key: string, login: string): Promise<boolean> {
    delete this.store[this.secureKey(key, login)]
    return Promise.resolve(true)
  }
}

