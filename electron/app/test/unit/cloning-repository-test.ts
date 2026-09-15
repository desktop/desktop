import { describe, it } from 'node:test'
import assert from 'node:assert'
import { CloningRepository } from '../../src/models/cloning-repository'

describe('CloningRepository', () => {
  describe('name', () => {
    it('provides the name of the repository being cloned', () => {
      const repository = new CloningRepository(
        'C:/some/path/to/desktop',
        'https://github.com/desktop/desktop'
      )

      assert.equal(repository.name, 'desktop')
    })

    it('extracts the repo name from the url not the path', () => {
      const repository = new CloningRepository(
        'C:/some/path/to/repo',
        'https://github.com/desktop/desktop'
      )

      assert.equal(repository.name, 'desktop')
    })

    it('extracts the repo name without git suffix', () => {
      const repository = new CloningRepository(
        'C:/some/path/to/repo',
        'https://github.com/desktop/desktop.git'
      )

      assert.equal(repository.name, 'desktop')
    })
  })

  describe('identity', () => {
    it('generates unique IDs', () => {
      const firstRepository = new CloningRepository(
        '/tmp/a',
        'https://github.com/owner/a.git'
      )
      const secondRepository = new CloningRepository(
        '/tmp/b',
        'https://github.com/owner/b.git'
      )

      assert.notEqual(firstRepository.id, secondRepository.id)
    })

    it('generates a hash from the repository identity', () => {
      const repository = new CloningRepository(
        '/tmp/test',
        'https://github.com/owner/repo.git'
      )

      assert.ok(repository.hash.length > 0)
      assert.ok(repository.hash.includes(repository.path))
    })
  })
})
