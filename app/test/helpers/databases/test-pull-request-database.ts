import { PullRequestDatabase } from '../../../src/lib/databases'

export class TestPullRequestDatabase extends PullRequestDatabase {
  public constructor() {
    super('TestPullRequestDatabase')
  }

  public async reset(): Promise<void> {
    await this.delete()
    await this.open()
  }
}
