import { Emitter, Disposable } from 'event-kit'

import { IAheadBehind } from '../../models/branch'
import { Repository } from '../../models/repository'

export type CacheUpdatedEvent = {
  readonly repository: Repository
  readonly aheadBehindCache: Map<string, IAheadBehind>
}

export type CacheInsertEvent = {
  readonly from: string
  readonly to: string
  readonly aheadBehind: IAheadBehind
}

export class AheadBehindCacheEmitter {
  protected readonly emitter = new Emitter()

  public onDidUpdate(fn: (event: CacheUpdatedEvent) => void): Disposable {
    return this.emitter.on('cache-updated', fn)
  }

  public fireUpdate(event: CacheUpdatedEvent) {
    this.emitter.emit('cache-updated', event)
  }

  public onInsertValue(fn: (event: CacheInsertEvent) => void): Disposable {
    return this.emitter.on('insert-cache', fn)
  }

  public insertValue(event: CacheInsertEvent) {
    this.emitter.emit('insert-cache', event)
  }
}
