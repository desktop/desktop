import { RemoteTagsDatabase } from '../../../src/lib/databases/remote-tags-database'

export class TestRemoteTagsDatabase extends RemoteTagsDatabase {
  public constructor() {
    super('TestRemoteTagsDatabase')
  }

  public async reset(): Promise<void> {
    await this.delete()
    await this.open()
  }
}
