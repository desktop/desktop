import assert from 'node:assert'
import { it } from 'node:test'
import { AppStore } from '../../../src/lib/stores/app-store'
import { Repository } from '../../../src/models/repository'
import { createTestRepositoryStateCache } from '../../helpers/app-store-test-harness'

it('drops a commit batch loaded for a history that was refreshed', async () => {
  const repository = new Repository('/repo', 1, null, false)
  const cache = createTestRepositoryStateCache()
  const setHistory = (commitSHAs: string[]) =>
    cache.updateCompareState(repository, () => ({ commitSHAs }))
  setHistory(['a'])
  const loadCommitBatch = async () => (setHistory(['b', 'a']), ['a'])
  const gitStore = { localCommitSHAs: [], loadCommitBatch }
  const appStore: any = Object.create(AppStore.prototype)
  appStore.repositoryStateCache = cache
  appStore.gitStoreCache = { get: () => gitStore }
  appStore.emitUpdate = () => {}
  await appStore._loadNextCommitBatch(repository)
  assert.deepStrictEqual(cache.get(repository).compareState.commitSHAs, [
    'b',
    'a',
  ])
})
