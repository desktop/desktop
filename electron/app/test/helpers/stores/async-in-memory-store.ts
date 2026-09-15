export class AsyncInMemoryStore {
  private store: { [key: string]: string }

  public constructor() {
    this.store = {}
  }

  private secureKey(key: string, login: string): string {
    return `__key/${key}/${login}`
  }

  public setItem(
    key: string,
    loginOrValue: string,
    secureValue?: string
  ): Promise<void> {
    if (secureValue) {
      const internalKey = this.secureKey(key, loginOrValue)
      this.store[internalKey] = secureValue
    } else {
      this.store[key] = loginOrValue
    }
    return Promise.resolve()
  }

  public getItem(key: string, login?: string): Promise<string | null> {
    const internalKey = login ? this.secureKey(key, login) : key
    return Promise.resolve(this.store[internalKey] || null)
  }

  public deleteItem(key: string, login: string): Promise<boolean> {
    delete this.store[this.secureKey(key, login)]
    return Promise.resolve(true)
  }
}
