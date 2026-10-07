import { GitStore } from './git-store'
import { Repository } from '../../models/repository'
import { IAppShell } from '../app-shell'
import { IStatsStore } from '../stats'

export class GitStoreCache {
  /** GitStores keyed by their hash. */
  private readonly gitStores = new Map<string, GitStore>()
  private readonly nativeStores = new Map<
    string,
    { readonly repository: Repository; readonly store: GitStore }
  >()

  public constructor(
    private readonly shell: IAppShell,
    private readonly statsStore: IStatsStore,
    private readonly onGitStoreUpdated: (
      repository: Repository,
      gitStore: GitStore
    ) => void,
    private readonly onDidError: (error: Error) => void
  ) {}

  public remove(repository: Repository) {
    if (this.gitStores.has(repository.hash)) {
      this.gitStores.delete(repository.hash)
    }
    const identity = `${repository.id}\0${repository.path}`
    if (this.nativeStores.get(identity)?.repository.hash === repository.hash) {
      this.nativeStores.delete(identity)
    }
  }

  public get(repository: Repository): GitStore {
    const identity = `${repository.id}\0${repository.path}`
    let gitStore = this.gitStores.get(repository.hash)
    const authoritative = this.nativeStores.get(identity)
    if (
      gitStore !== undefined &&
      authoritative !== undefined &&
      authoritative.store !== gitStore
    ) {
      return authoritative.store
    }
    if (gitStore === undefined) {
      const previous = this.getLatestCommitInputsStore(repository)
      gitStore = new GitStore(repository, this.shell, this.statsStore)
      if (previous !== undefined) {
        gitStore.adoptCommitInputs(previous)
      }
      gitStore.onDidUpdate(() => {
        const latest = this.getLatestCommitInputsStore(repository)
        if (latest !== undefined) {
          for (const store of this.gitStores.values()) {
            if (
              store.matchesRepositoryIdentity(repository) &&
              store !== latest
            ) {
              store.adoptCommitInputs(latest)
            }
          }
        }
        const native = this.nativeStores.get(identity)
        if (native !== undefined) {
          this.onGitStoreUpdated(native.repository, native.store)
        }
      })
      gitStore.onDidError(error => this.onDidError(error))

      this.gitStores.set(repository.hash, gitStore)
      this.nativeStores.set(identity, { repository, store: gitStore })
    }

    return gitStore
  }

  private getLatestCommitInputsStore(
    repository: Repository
  ): GitStore | undefined {
    return [...this.gitStores.values()]
      .filter(store => store.matchesRepositoryIdentity(repository))
      .reduce<GitStore | undefined>(
        (latest, store) =>
          latest === undefined ||
          store.commitInputsRevision > latest.commitInputsRevision
            ? store
            : latest,
        undefined
      )
  }
}
