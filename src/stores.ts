export interface DataStore {
  setItem(key: string, value: string): void
  getItem(key: string): string
}


export interface SecureStore {
  setItem(key: string, login: string, value: string): void
  getItem(key: string, login: string): string
}
