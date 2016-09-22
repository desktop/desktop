import { Database } from '../src/shared-process/database'

export class TestDatabase extends Database {
  public constructor() {
    super('TestDatabase')
  }

  public async reset(): Promise<void> {
    await this.delete()
    await this.open()
  }
}
