import * as Path from 'path'

import { Emitter, Disposable } from 'event-kit'

import { LocalGitOperations } from '../local-git-operations'

interface ICloningRepositoryInfo {
  readonly progress: string
  readonly promise: Promise<void>
}

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

  private readonly repositoryInfo = new Map<CloningRepository, ICloningRepositoryInfo>()

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

    const promise = LocalGitOperations
      .clone(url, path, progress => {
        const existing = this.repositoryInfo.get(cloningRepository)!
        this.repositoryInfo.set(cloningRepository, { progress, promise: existing.promise })
        this.emitUpdate()
      })
      .then(() => {
        this.repositoryInfo.delete(cloningRepository)
        this.emitUpdate()
      })

    this.repositoryInfo.set(cloningRepository, { progress: '', promise })
    this.emitUpdate()

    return Promise.resolve(cloningRepository)
  }

  public get repositories(): ReadonlyArray<CloningRepository> {
    return Array.from(this.repositoryInfo.keys())
  }

  public getProgress(repository: CloningRepository): string | null {
    const info = this.repositoryInfo.get(repository)
    return info ? info.progress : null
  }

  public getPromise(repository: CloningRepository): Promise<void> | null {
    const info = this.repositoryInfo.get(repository)
    return info ? info.promise : null
  }

  /** Remove the repository. */
  public remove(repository: CloningRepository) {
    this.repositoryInfo.delete(repository)
    this.emitUpdate()
  }
}
