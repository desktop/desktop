import { Emitter, Disposable } from 'event-kit'

import { IAheadBehind, Branch } from '../../models/branch'
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

export type ScheduleEvent = {
  readonly currentBranch: Branch
  readonly defaultBranch: Branch | null
  readonly recentBranches: ReadonlyArray<Branch>
  readonly allBranches: ReadonlyArray<Branch>
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

  public onScheduleComparisons(fn: (event: ScheduleEvent) => void): Disposable {
    return this.emitter.on('schedule-comparisons', fn)
  }

  public scheduleComparisons(event: ScheduleEvent) {
    this.emitter.emit('schedule-comparisons', event)
  }

  public onPause(fn: () => void): Disposable {
    return this.emitter.on('pause-comparisons', fn)
  }

  public pause() {
    this.emitter.emit('pause-comparisons', null)
  }
}
