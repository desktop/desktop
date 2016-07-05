import * as path from 'path'

import GitHubRepository, {IGitHubRepository} from './github-repository'

/** The data-only interface for Repository for transport across IPC. */
export interface IRepository {
  path: string
  gitHubRepository: IGitHubRepository
}

/**
 * A local repository.
 */
export default class Repository implements IRepository {
  private _path: string
  private _gitHubRepository: GitHubRepository

  /** Create a new Repository from a data-only representation. */
  public static fromJSON(json: IRepository): Repository {
    const gitHubRepository = json.gitHubRepository
    if (gitHubRepository) {
       return new Repository(json.path, GitHubRepository.fromJSON(gitHubRepository))
    } else {
      return new Repository(json.path, null)
    }
  }

  public constructor(path: string, gitHubRepository: GitHubRepository) {
    this._path = path
    this._gitHubRepository = gitHubRepository
  }

  public get gitHubRepository(): GitHubRepository { return this._gitHubRepository }
  public get path(): string { return this._path }
  public get name(): string { return path.basename(this._path) }
}
