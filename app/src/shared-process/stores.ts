export interface IDataStore {
  setItem(key: string, value: string): void
  getItem(key: string): string | null
}


export interface ISecureStore {
  setItem(key: string, login: string, value: string): void
  getItem(key: string, login: string): string | null
}
