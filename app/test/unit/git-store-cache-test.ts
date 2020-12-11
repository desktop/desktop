import { Repository } from '../../src/models/repository'
import { GitStoreCache } from '../../src/lib/stores/git-store-cache'
import { shell } from '../helpers/test-app-shell'

describe('GitStoreCache', () => {
  let r: Repository | null = null

  const onGitStoreUpdated = () => {}
  const onDidLoadNewCommits = () => {}
  const onDidError = () => {}

  beforeEach(() => {
    r = new Repository('/something/path', 1, null, false)
  })

  it('returns same instance of GitStore', () => {
    const repository = r!

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
    const repository = r!

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
