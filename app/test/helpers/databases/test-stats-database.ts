import { StatsDatabase } from '../../../src/lib/stats'

export class TestStatsDatabase extends StatsDatabase {
  public constructor() {
    super('TestStatsDatabase')
  }

  public async reset(): Promise<void> {
    await this.delete()
    await this.open()
  }
}
