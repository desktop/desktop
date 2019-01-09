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

/**
 * Connect components which are responsible for computing ahead/behind counts
 * in the application.
 *
 * This component exists for the lifetime of the application, so listeners
 * which have a shorter lifespan must ensure they dispose their subscriptions
 * when their work is done.
 */
export class AheadBehindEmitter {
  protected readonly emitter = new Emitter()

  /**
   * Register to receive cache update events
   */
  public onDidUpdate(fn: (event: CacheUpdatedEvent) => void): Disposable {
    return this.emitter.on('cache-updated', fn)
  }

  /**
   * Signal to listeners that the cache has been updated for a specific repository
   */
  public fireUpdate(event: CacheUpdatedEvent) {
    this.emitter.emit('cache-updated', event)
  }

  /**
   * Register to receive cache insert events
   */
  public onInsertValue(fn: (event: CacheInsertEvent) => void): Disposable {
    return this.emitter.on('insert-cache', fn)
  }

  /**
   * Signal to listeners that a value should be inserted in the cache
   */
  public insertValue(event: CacheInsertEvent) {
    this.emitter.emit('insert-cache', event)
  }

  /**
   * Register to receive cache schedule events
   */
  public onScheduleComparisons(fn: (event: ScheduleEvent) => void): Disposable {
    return this.emitter.on('schedule-comparisons', fn)
  }

  /**
   * Signal to listeners that a set of comparisons should be scheduled
   */
  public scheduleComparisons(event: ScheduleEvent) {
    this.emitter.emit('schedule-comparisons', event)
  }

  /**
   * Register to receive cache pause events
   */
  public onPause(fn: () => void): Disposable {
    return this.emitter.on('pause-comparisons', fn)
  }

  /**
   * Signal to listeners that comparisons must be paused
   */
  public pause() {
    this.emitter.emit('pause-comparisons', null)
  }
}
