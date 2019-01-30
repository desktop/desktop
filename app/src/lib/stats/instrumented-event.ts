import Dexie from 'dexie'

export type InstrumentedEvent =
  | {
      type: 'merge_initated'
      timestamp: number
    }
  | {
      type: 'merged_completed'
      timestamp: number
    }
  | {
      type: 'merge_aborted'
      conflicts: number
      timestamp: number
    }
  | {
      type: 'app_started'
      timestamp: number
    }
  | {
      type: 'main_process_ready'
      timestamp: number
    }
  | {
      type: 'renderer_process_ready'
      timestamp: number
    }
  | {
      type: 'app_closed'
      timestamp: number
    }

export class MetricsDatabase extends Dexie {
  public events!: Dexie.Table<InstrumentedEvent, number>

  public constructor(name: string) {
    super(name)

    this.version(1).stores({ events: '++id' })
  }
}
