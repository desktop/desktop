import { Repository } from '../../src/models/repository'
import { GitStoreCache } from '../../src/lib/stores/git-store-cache'
import { shell } from '../helpers/test-app-shell'
import { StatsStore, StatsDatabase } from '../../src/lib/stats'
import { UiActivityMonitor } from '../../src/ui/lib/ui-activity-monitor'
import { fakePost } from '../fake-stats-post'

describe('GitStoreCache', () => {
  let repository: Repository
  let statsStore: StatsStore

  const onGitStoreUpdated = () => {}
  const onDidError = () => {}

  beforeEach(() => {
    repository = new Repository('/something/path', 1, null, false)
    statsStore = new StatsStore(
      new StatsDatabase('test-StatsDatabase'),
      new UiActivityMonitor(),
      fakePost
    )
  })

  it('returns same instance of GitStore', () => {
    const cache = new GitStoreCache(
      shell,
      statsStore,
      onGitStoreUpdated,
      onDidError
    )

    const first = cache.get(repository)
    const second = cache.get(repository)

    expect(first).toBe(second)
  })

  it('returns different instance of GitStore after removing', () => {
    const cache = new GitStoreCache(
      shell,
      statsStore,
      onGitStoreUpdated,
      onDidError
    )

    const first = cache.get(repository)
    cache.remove(repository)
    const second = cache.get(repository)

    expect(first).not.toBe(second)
  })
})
