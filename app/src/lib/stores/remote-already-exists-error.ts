import { Repository } from '../../models/repository'
import { IRemote } from '../../models/remote'

export class RemoteAlreadyExistsError extends Error {
  public readonly repository: Repository
  public readonly existingRemote: IRemote

  public constructor(repository: Repository, existingRemote: IRemote) {
    super(`The remote '${existingRemote.name}' already exists`)

    this.repository = repository
    this.existingRemote = existingRemote
  }
}
