import { Repository } from '../../models/repository'
import { IRemote } from '../../models/remote'

/**
 * The error thrown when a repository is a fork but its upstream remote isn't
 * the parent.
 */
export class UpstreamAlreadyExistsError extends Error {
  public readonly repository: Repository
  public readonly existingRemote: IRemote

  public constructor(repository: Repository, existingRemote: IRemote) {
    super(`The remote '${existingRemote.name}' already exists`)

    this.repository = repository
    this.existingRemote = existingRemote
  }
}
