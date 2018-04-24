import { IAheadBehind } from '../models/branch'
import { asRange } from '../lib/git'

export class ComparisonCache {
  private backingStore = new Map<string, IAheadBehind>()

  public set(from: string, to: string, value: IAheadBehind) {
    const key = asRange(from, to)
    this.backingStore.set(key, value)
  }

  public get(from: string, to: string) {
    const key = asRange(from, to)
    return this.backingStore.get(key) || null
  }

  public has(from: string, to: string) {
    const key = asRange(from, to)
    return this.backingStore.has(key)
  }

  public get size() {
    return this.backingStore.size
  }

  public clear() {
    this.backingStore.clear()
  }
}
