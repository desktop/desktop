import * as Path from 'path'

import { Emitter, Disposable } from 'event-kit'

import { LocalGitOperations } from '../local-git-operations'

let CloningRepositoryID = 0

/** A repository which is currently being cloned. */
export class CloningRepository {
  public readonly id: number
  public readonly path: string
  public readonly url: string
  public readonly progress: string

  public constructor(path: string, url: string, progress?: string, id?: number) {
    this.id = id || CloningRepositoryID++
    this.path = path
    this.url = url
    this.progress = progress || ''
  }

  public get name(): string {
    return Path.basename(this.path)
  }

  public withProgress(progress: string): CloningRepository {
    return new CloningRepository(this.path, this.url, progress, this.id)
  }
}

/** The store in charge of repository currently being cloned. */
export class CloningRepositoriesStore {
  private readonly emitter = new Emitter()

  private readonly repositoriesByURL = new Map<number, CloningRepository>()

  private emitQueued = false

  private emitUpdate() {
    if (this.emitQueued) { return }

    this.emitQueued = true

    window.requestAnimationFrame(() => {
      this.emitter.emit('did-update', {})
      this.emitQueued = false
    })
  }

  /** Register a function to be called when the store updates. */
  public onDidUpdate(fn: () => void): Disposable {
    return this.emitter.on('did-update', fn)
  }

  /** Clone the repository at the URL to the path. */
  public clone(url: string, path: string): Promise<void> {
    const repository = new CloningRepository(path, url)
    this.repositoriesByURL.set(repository.id, repository)

    const promise = LocalGitOperations
      .clone(url, path, progress => {
        const existing = this.repositoriesByURL.get(repository.id)!
        const newRepo = existing.withProgress(progress)
        this.repositoriesByURL.set(repository.id, newRepo)
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
    return Array.from(this.repositories)
  }

  /** Remove the repository. */
  public remove(repository: CloningRepository) {
    this.repositoriesByURL.delete(repository.id)
    this.emitUpdate()
  }
}
