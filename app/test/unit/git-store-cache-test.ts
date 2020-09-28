import { Repository } from '../../src/models/repository'
import { GitStoreCache } from '../../src/lib/stores/git-store-cache'
import { shell } from '../helpers/test-app-shell'

describe('GitStoreCache', () => {
  let repository: Repository

  const onGitStoreUpdated = () => {}
  const onDidLoadNewCommits = () => {}
  const onDidError = () => {}

  beforeEach(() => {
    repository = new Repository('/something/path', 1, null, false)
  })

  it('returns same instance of GitStore', () => {
    const cache = new GitStoreCache(
      shell,
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
