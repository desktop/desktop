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

  describe('favouriteGroupId', () => {
    it('defaults to null and isFavourite false', () => {
      const repository = new Repository('/some/path', 1, null, false)
      assert.equal(repository.favouriteGroupId, null)
      assert.equal(repository.isFavourite, false)
    })

    it('reports isFavourite=true when assigned to a group', () => {
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
      assert.equal(repository.isFavourite, true)
      assert.equal(repository.favouriteGroupId, 7)
    })

    it('produces a different hash when the favourite group changes', () => {
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
    })
  })
})
