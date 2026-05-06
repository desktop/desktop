import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Repository } from '../../src/models/repository'

describe('Repository', () => {
  describe('name', () => {
    it('uses the last path component as the name', async () => {
      const repoPath = '/some/cool/path'
      const repository = new Repository(repoPath, -1, null, false)
      assert.equal(repository.name, 'path')
    })

    it('handles repository at root of the drive', async () => {
      const repoPath = 'T:\\'
      const repository = new Repository(repoPath, -1, null, false)
      assert.equal(repository.name, 'T:\\')
    })
  })

  describe('favoriteGroupId', () => {
    it('defaults to null and isFavorite false', () => {
      const repository = new Repository('/some/path', 1, null, false)
      assert.equal(repository.favoriteGroupId, null)
      assert.equal(repository.isFavorite, false)
    })

    it('reports isFavorite=true when assigned to a group', () => {
      const repository = new Repository(
        '/some/path',
        1,
        null,
        false,
        null,
        {},
        false,
        7
      )
      assert.equal(repository.isFavorite, true)
      assert.equal(repository.favoriteGroupId, 7)
    })

    it('produces a different hash when the favorite group changes', () => {
      const a = new Repository(
        '/some/path',
        1,
        null,
        false,
        null,
        {},
        false,
        null
      )
      const b = new Repository('/some/path', 1, null, false, null, {}, false, 1)
      const c = new Repository('/some/path', 1, null, false, null, {}, false, 2)
      assert.notEqual(a.hash, b.hash)
      assert.notEqual(b.hash, c.hash)
      assert.notEqual(a.hash, c.hash)
    })

    it('treats undefined and null favoriteGroupId equivalently', () => {
      const a = new Repository('/some/path', 1, null, false)
      const b = new Repository(
        '/some/path',
        1,
        null,
        false,
        null,
        {},
        false,
        null
      )
      assert.equal(a.favoriteGroupId, null)
      assert.equal(b.favoriteGroupId, null)
      assert.equal(a.isFavorite, false)
      assert.equal(b.isFavorite, false)
      assert.equal(a.hash, b.hash)
    })
  })
})
