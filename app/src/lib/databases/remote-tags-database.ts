import Dexie from 'dexie'
import { BaseDatabase } from './base-database'
import { Repository } from '../../models/repository'
import { IRemote } from '../../models/remote'

export type RemoteTags = {
  tags: ReadonlyArray<string>
  repositoryID: number
  remoteURL: string
}

export class RemoteTagsDatabase extends BaseDatabase {
  public tags!: Dexie.Table<RemoteTags, number>

  public constructor(name: string, schemaVersion?: number) {
    super(name, schemaVersion)

    this.conditionalVersion(1, {
      tags: '&[repositoryID+remoteURL]',
    })
  }

  /**
   * Retrieve all remote tags for the given repository.
   */
  public async getAllRemoteTagsInRepository(
    repository: Repository,
    remote: IRemote
  ) {
    const row = await this.tags
      .where('[repositoryID+remoteURL]')
      .equals([repository.id, remote.url])
      .first()

    if (!row) {
      return null
    }

    return row.tags
  }
}
