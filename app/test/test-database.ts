import { RepositoriesDatabase } from '../src/lib/dispatcher'

export class TestDatabase extends RepositoriesDatabase {
  public constructor() {
    super('TestDatabase')
  }

  public async reset(): Promise<void> {
    await this.delete()
    await this.open()
  }
}
