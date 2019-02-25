import { StatsDatabase } from '../../../src/lib/stats'
import { MetricsDatabase } from '../../../src/lib/stats/instrumented-event'

export class TestStatsDatabase extends StatsDatabase {
  public constructor() {
    super('TestStatsDatabase')
  }

  public async reset(): Promise<void> {
    await this.delete()
    await this.open()
  }
}

export class TestMetricsDatabase extends MetricsDatabase {
  public constructor() {
    super('TestMetricsDatabase')
  }

  public async reset(): Promise<void> {
    await this.delete()
    await this.open()
  }
}
