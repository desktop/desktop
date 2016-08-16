import { Emitter, Disposable } from 'event-kit'

import { Commit, LocalGitOperations } from '../local-git-operations'
import Repository from '../../models/repository'

export default class GitStore {
  private readonly emitter = new Emitter()

  private emitQueued = false

  private readonly commitCache = new Map<string, Commit>()

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

  public getCommit(repository: Repository, ref: string): Commit | null {
    const key = calculateCacheKey(repository, ref)
    const commit = this.commitCache.get(key)
    return commit ? commit : null
  }

  public cacheCommit(repository: Repository, commit: Commit) {
    const key = calculateCacheKey(repository, commit.sha)
    this.commitCache.set(key, commit)
    this.emitUpdate()
  }

  public async _loadAndCacheCommit(repository: Repository, ref: string): Promise<void> {
    const commit = await LocalGitOperations.getCommit(repository, ref)
    if (!commit) { return }

    this.cacheCommit(repository, commit)
  }
}

function calculateCacheKey(repository: Repository, ref: string): string {
  return `${repository.id}/${ref}`
}
