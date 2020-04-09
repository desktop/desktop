import { Repository } from '../../src/models/repository'
import { GitStoreCache } from '../../src/lib/stores/git-store-cache'
import { shell } from '../helpers/test-app-shell'
import { RemoteTagsStore } from '../../src/lib/stores/remote-tags-store'
import { TestRemoteTagsDatabase } from '../helpers/databases/test-remote-tags-database'

describe('GitStoreCache', () => {
  let repository: Repository

  const onGitStoreUpdated = () => {}
  const onDidLoadNewCommits = () => {}
  const onDidError = () => {}
  const remoteTagsStore = new RemoteTagsStore(new TestRemoteTagsDatabase())

  beforeEach(() => {
    repository = new Repository('/something/path', 1, null, false)
  })

  it('returns same instance of GitStore', () => {
    const cache = new GitStoreCache(
      shell,
      remoteTagsStore,
      onGitStoreUpdated,
      onDidLoadNewCommits,
      onDidError
    )

    const first = cache.get(repository)
    const second = cache.get(repository)

    expect(first).toBe(second)
  })

  it('returns different instance of GitStore after removing', () => {
    const cache = new GitStoreCache(
      shell,
      remoteTagsStore,
      onGitStoreUpdated,
      onDidLoadNewCommits,
      onDidError
    )

    const first = cache.get(repository)
    cache.remove(repository)
    const second = cache.get(repository)

    expect(first).not.toBe(second)
  })
})
