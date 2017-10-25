import { RepositoriesDatabase } from '../../../src/lib/databases'

export class TestRepositoriesDatabase extends RepositoriesDatabase {
  public constructor() {
    super('TestRepositoriesDatabase')
  }

  public async reset(): Promise<void> {
    await this.delete()
    await this.open()
  }
}
