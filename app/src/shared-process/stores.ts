export interface IDataStore {
  setItem(key: string, value: string): void
  getItem(key: string): string
}


export interface ISecureStore {
  setItem(key: string, login: string, value: string): void
  getItem(key: string, login: string): string
}
