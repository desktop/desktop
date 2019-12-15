import { GitStore } from './git-store'
import { Repository } from '../../models/repository'
import { IAppShell } from '../app-shell'
import { Commit } from '../../models/commit'

export class GitStoreCache {
  /** GitStores keyed by their hash. */
  private readonly gitStores = new Map<string, GitStore>()

  public constructor(
    private readonly shell: IAppShell,
    private readonly onGitStoreUpdated: (
      repository: Repository,
      gitStore: GitStore
    ) => void,
    private readonly onDidLoadNewCommits: (
      repository: Repository,
      commits: ReadonlyArray<Commit>
    ) => void,
    private readonly onDidError: (error: Error) => void
  ) {}

  public remove(repository: Repository) {
    if (this.gitStores.has(repository.hash)) {
      this.gitStores.delete(repository.hash)
    }
  }

  public get(repository: Repository): GitStore {
    let gitStore = this.gitStores.get(repository.hash)
    if (gitStore === undefined) {
      gitStore = new GitStore(repository, this.shell)
      gitStore.onDidUpdate(() => this.onGitStoreUpdated(repository, gitStore!))
      gitStore.onDidLoadNewCommits(commits =>
        this.onDidLoadNewCommits(repository, commits)
      )
      gitStore.onDidError(error => this.onDidError(error))

      this.gitStores.set(repository.hash, gitStore)
    }

    return gitStore
  }
}
