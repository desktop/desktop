import { GitStore } from './git-store'
import { Repository, getRepositoryStateKey } from '../../models/repository'
import { IAppShell } from '../app-shell'
import { IStatsStore } from '../stats'
import { Disposable } from 'event-kit'

interface IGitStoreEntry {
  readonly gitStore: GitStore
  readonly subscriptions: ReadonlyArray<Disposable>
}

/**
 * GitStores keyed by the working directory they operate on.
 *
 * A repository's account and metadata can change while a store is in use, so
 * stores are keyed by `getRepositoryStateKey` rather than the repository hash.
 * That way there's only ever one store per working directory and in-flight
 * operations keep updating the state that's being displayed.
 */
export class GitStoreCache {
  private readonly gitStores = new Map<string, IGitStoreEntry>()

  /**
   * The latest repository given to `setRepository` for each key, used when a
   * store is created afterwards with an older snapshot.
   */
  private readonly repositories = new Map<string, Repository>()

  public constructor(
    private readonly shell: IAppShell,
    private readonly statsStore: IStatsStore,
    private readonly onGitStoreUpdated: (
      repository: Repository,
      gitStore: GitStore
    ) => void,
    private readonly onDidError: (error: Error) => void
  ) {}

  /** Remove and stop listening to the store for the repository. */
  public remove(repository: Repository) {
    const key = getRepositoryStateKey(repository)
    const entry = this.gitStores.get(key)
    if (entry !== undefined) {
      entry.subscriptions.forEach(s => s.dispose())
      this.gitStores.delete(key)
    }
  }

  /** Whether a GitStore has been created for the repository. */
  public has(repository: Repository): boolean {
    return this.gitStores.has(getRepositoryStateKey(repository))
  }

  /**
   * Get the store for the repository, creating it if necessary.
   *
   * An existing store keeps the repository it was last given through
   * `setRepository`, since the given repository may be an older snapshot.
   */
  public get(repository: Repository): GitStore {
    const key = getRepositoryStateKey(repository)
    const existing = this.gitStores.get(key)
    if (existing !== undefined) {
      return existing.gitStore
    }

    const gitStore = new GitStore(
      this.repositories.get(key) ?? repository,
      this.shell,
      this.statsStore
    )
    const subscriptions = [
      gitStore.onDidUpdate(() =>
        this.onGitStoreUpdated(gitStore.repository, gitStore)
      ),
      gitStore.onDidError(error => this.onDidError(error)),
    ]
    this.gitStores.set(key, { gitStore, subscriptions })

    return gitStore
  }

  /**
   * Make the given snapshot the repository of the store for its key, both
   * for an existing store and one created later.
   */
  public setRepository(repository: Repository) {
    const key = getRepositoryStateKey(repository)
    this.repositories.set(key, repository)
    this.gitStores.get(key)?.gitStore.setRepository(repository)
  }

  /**
   * Move the store for the source repository to the target repository.
   *
   * Used when a worktree's path changes but it still refers to the same
   * working directory. Any store already cached for the target is removed.
   */
  public transfer(source: Repository, target: Repository) {
    const sourceKey = getRepositoryStateKey(source)
    const targetKey = getRepositoryStateKey(target)
    if (sourceKey === targetKey) {
      this.setRepository(target)
      return
    }

    const entry = this.gitStores.get(sourceKey)
    this.remove(target)
    this.repositories.delete(sourceKey)
    this.repositories.set(targetKey, target)
    if (entry !== undefined) {
      this.gitStores.delete(sourceKey)
      entry.gitStore.setRepository(target)
      this.gitStores.set(targetKey, entry)
    }
  }
}
