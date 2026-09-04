import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert'
import {
  DefaultRecentRepositoriesCount,
  MaximumRecentRepositoriesCount,
  getRecentRepositoriesCount,
  mergeRecentRepositories,
  setRecentRepositoriesCount,
} from '../../src/lib/recent-repositories'

describe('recent repositories', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('count', () => {
    it('defaults to the existing recent repository count', () => {
      assert.strictEqual(
        getRecentRepositoriesCount(),
        DefaultRecentRepositoriesCount
      )
    })

    it('supports zero to hide the Recent group', () => {
      setRecentRepositoriesCount(0)

      assert.strictEqual(getRecentRepositoriesCount(), 0)
    })

    it('constrains values to the supported range', () => {
      setRecentRepositoriesCount(-1)
      assert.strictEqual(getRecentRepositoriesCount(), 0)

      setRecentRepositoriesCount(MaximumRecentRepositoriesCount + 1)
      assert.strictEqual(
        getRecentRepositoriesCount(),
        MaximumRecentRepositoriesCount
      )
    })
  })

  describe('history', () => {
    it('keeps current recent repositories first and removes duplicates', () => {
      mergeRecentRepositories([3, 2, 1])

      assert.deepStrictEqual(mergeRecentRepositories([4, 3, 2]), [4, 3, 2, 1])
    })

    it('stores at most the maximum number of repositories', () => {
      const repositoryIds = Array.from(
        { length: MaximumRecentRepositoriesCount + 10 },
        (_, index) => index + 1
      )

      const recentRepositories = mergeRecentRepositories(repositoryIds)

      assert.strictEqual(
        recentRepositories.length,
        MaximumRecentRepositoriesCount
      )
      assert.strictEqual(recentRepositories[0], 1)
      assert.strictEqual(
        recentRepositories[recentRepositories.length - 1],
        MaximumRecentRepositoriesCount
      )
    })
  })
})
