import { IAheadBehind } from '../models/branch'

export class ComparisonCache {
  private backingStore = new Map<string, IAheadBehind>()

  private static getKey(from: string, to: string) {
    return `${from}...${to}`
  }

  public set(from: string, to: string, value: IAheadBehind) {
    const key = ComparisonCache.getKey(from, to)
    this.backingStore.set(key, value)
  }

  public get(from: string, to: string) {
    const key = ComparisonCache.getKey(from, to)
    return this.backingStore.get(key) || null
  }

  public has(from: string, to: string) {
    const key = ComparisonCache.getKey(from, to)
    return this.backingStore.has(key)
  }

  public get size() {
    return this.backingStore.size
  }

  public clear() {
    this.backingStore.clear()
  }
}
