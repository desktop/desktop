import * as Path from 'path'

import { Emitter, Disposable } from 'event-kit'

import { LocalGitOperations } from '../local-git-operations'

export class CloningRepository {
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

export class CloningRepositoriesStore {
  private readonly emitter = new Emitter()

  private readonly repositoryProgress = new Map<CloningRepository, string>()
  private readonly repositoryPromise = new Map<CloningRepository, Promise<void>>()

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

  public clone(url: string, path: string): Promise<CloningRepository> {
    const cloningRepository = new CloningRepository(path, url)

    this.repositoryProgress.set(cloningRepository, 'Cloning…')

    const promise = LocalGitOperations
      .clone(url, path, progress => {
        this.repositoryProgress.set(cloningRepository, progress)
        this.emitUpdate()
      })
      .then(() => {
        this.repositoryProgress.delete(cloningRepository)
        this.repositoryPromise.delete(cloningRepository)
        this.emitUpdate()
      })
    this.repositoryPromise.set(cloningRepository, promise)

    this.emitUpdate()

    return Promise.resolve(cloningRepository)
  }

  public get repositories(): ReadonlyArray<CloningRepository> {
    return Array.from(this.repositoryProgress.keys())
  }

  public getProgress(repository: CloningRepository): string | null {
    const progress = this.repositoryProgress.get(repository)
    return progress ? progress : null
  }

  public getPromise(repository: CloningRepository): Promise<void> | null {
    const promise = this.repositoryPromise.get(repository)
    return promise ? promise : null
  }
}
