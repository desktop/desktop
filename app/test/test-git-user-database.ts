import { GitUserDatabase } from '../src/lib/dispatcher/git-user-database'

export default class TestDatabase extends GitUserDatabase {
  public constructor() {
    super('TestGitUserDatabase')
  }

  public async reset(): Promise<void> {
    await this.delete()
    await this.open()
  }
}
