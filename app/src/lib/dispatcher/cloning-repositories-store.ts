import * as Path from 'path'

import { Emitter, Disposable } from 'event-kit'

import { LocalGitOperations } from '../local-git-operations'
import { CloneProgressParser } from '../clone-progress-parser'
import User from '../../models/user'

let CloningRepositoryID = 1

/** A repository which is currently being cloned. */
export class CloningRepository {
  public readonly id = CloningRepositoryID++
  public readonly path: string
  public readonly url: string

  public constructor(path: string, url: string) {
    this.path = path
    this.url = url
  }

  public get name(): string {
    return Path.basename(this.path)
  }
}

/** The cloning progress of a repository. */
export interface ICloningRepositoryState {
  /** The raw progress output from the clone task. */
  readonly output: string,

  /**
   * A value between 0 and 1 indicating the clone progress.
   *
   * A missing value indicates that the current progress is
   * indeterminate.
   */
  readonly progressValue: number | null
}

/** The store in charge of repository currently being cloned. */
export class CloningRepositoriesStore {
  private readonly emitter = new Emitter()

  private readonly _repositories = new Array<CloningRepository>()
  private readonly stateByID = new Map<number, ICloningRepositoryState>()

  private emitUpdate() {
    this.emitter.emit('did-update', {})
  }

  /** Register a function to be called when the store updates. */
  public onDidUpdate(fn: () => void): Disposable {
    return this.emitter.on('did-update', fn)
  }

  /** Clone the repository at the URL to the path. */
  public clone(url: string, path: string, user: User | null): Promise<void> {
    const repository = new CloningRepository(path, url)
    this._repositories.push(repository)
    this.stateByID.set(repository.id, { output: `Cloning into ${path}`, progressValue: null })

    const progressParser = new CloneProgressParser()

    const promise = LocalGitOperations
      .clone(url, path, user, progress => {
        this.stateByID.set(repository.id, {
          output: progress,
          progressValue: progressParser.parse(progress)
        })
        this.emitUpdate()
      })
      .then(() => {
        this.remove(repository)
      })

    this.emitUpdate()

    return promise
  }

  /** Get the repositories currently being cloned. */
  public get repositories(): ReadonlyArray<CloningRepository> {
    return Array.from(this._repositories)
  }

  /** Get the state of the repository. */
  public getRepositoryState(repository: CloningRepository): ICloningRepositoryState | null {
    return this.stateByID.get(repository.id) || null
  }

  /** Remove the repository. */
  public remove(repository: CloningRepository) {
    this.stateByID.delete(repository.id)

    const repoIndex = this._repositories.findIndex(r => r.id === repository.id)
    if (repoIndex > -1) {
      this._repositories.splice(repoIndex, 1)
    }

    this.emitUpdate()
  }
}
