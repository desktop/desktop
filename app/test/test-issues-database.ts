import { IssuesDatabase } from '../src/lib/dispatcher/issues-database'

export class TestIssuesDatabase extends IssuesDatabase {
  public constructor() {
    super('TestIssuesDatabase')
  }

  public async reset(): Promise<void> {
    await this.delete()
    await this.open()
  }
}
