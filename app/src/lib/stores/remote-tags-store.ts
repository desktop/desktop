import { RemoteTagsDatabase } from '../databases/remote-tags-database'
import { Emitter } from 'event-kit'
import { Repository } from '../../models/repository'
import { IRemote } from '../../models/remote'

/** The store for GitHub Pull Requests. */
export class RemoteTagsStore {
  protected readonly emitter = new Emitter()

  public constructor(private readonly database: RemoteTagsDatabase) {}

  public getRemoteTags(
    repository: Repository,
    remote: IRemote
  ): Promise<ReadonlyArray<string> | null> {
    return this.database.getAllRemoteTagsInRepository(repository, remote)
  }

  public async storeTags(
    repository: Repository,
    remote: IRemote,
    tags: ReadonlyArray<string>
  ) {
    await this.database.tags.put({
      repositoryID: repository.id,
      remoteURL: remote.url,
      tags,
    })
  }
}
