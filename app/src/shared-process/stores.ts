export interface IDataStore {
  setItem(key: string, value: string): void
  getItem(key: string): string | null
}

export interface ISecureStore {
  setItem(key: string, login: string, value: string): Promise<void>
  getItem(key: string, login: string): Promise<string | null>
  deleteItem(key: string, login: string): Promise<boolean>
}
