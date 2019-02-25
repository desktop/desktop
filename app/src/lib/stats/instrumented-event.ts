import Dexie from 'dexie'

export enum MergeSouce {
  'MergeIntoCurrentBranch',
  'UpdateFromDevelopment',
  'CompareTab',
  'BranchList',
  'NewCommitsBanner',
}

export type InstrumentedEvent =
  | {
      type: 'merge_initated'
      timestamp: number
      source: MergeSouce
    }
  | {
      type: 'merged_completed'
      timestamp: number
      source: MergeSouce
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

export class TelemetryDoodad {
  private get eventTable() {
    return this.db.table('events')
  }

  public async push(event: InstrumentedEvent): Promise<void> {
    await this.eventTable.add(event)
  }

  public constructor(private readonly db: MetricsDatabase) {}

  public async clearAllEvents(): Promise<void> {
    await this.eventTable.clear()
  }

  public async getAllEvents(): Promise<ReadonlyArray<InstrumentedEvent>> {
    return await this.eventTable.toArray()
  }
}
