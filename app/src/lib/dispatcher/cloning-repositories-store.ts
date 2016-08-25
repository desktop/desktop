import { Emitter, Disposable } from 'event-kit'

import { LocalGitOperations } from '../local-git-operations'

export class CloningRepository {
  public readonly path: string

  public constructor(path: string) {
    this.path = path
  }
}

export class CloningRepositoriesStore {
  private readonly emitter = new Emitter()

  private readonly repositoryProgress = new Map<CloningRepository, number>()

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

  public async clone(url: string, path: string) {
    const cloningRepository = new CloningRepository(path)

    this.repositoryProgress.set(cloningRepository, 0)
    this.emitUpdate()

    await LocalGitOperations.clone(url, path, progress => {
      this.repositoryProgress.set(cloningRepository, progress)
      this.emitUpdate()
    })

    this.repositoryProgress.delete(cloningRepository)
    this.emitUpdate()
  }

  public get repositories(): ReadonlyArray<CloningRepository> {
    return Array.from(this.repositoryProgress.keys())
  }

  public getProgress(repository: CloningRepository): number | null {
    const progress = this.repositoryProgress.get(repository)
    return progress ? progress : null
  }
}
