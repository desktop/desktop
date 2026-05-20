import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { CategoriesStore } from '../../src/lib/stores/categories-store'
import { RepositoriesStore } from '../../src/lib/stores/repositories-store'
import { TestRepositoriesDatabase } from '../helpers/databases'

describe('CategoriesStore', () => {
  let db = new TestRepositoriesDatabase()
  let categoriesStore = new CategoriesStore(db)
  let repositoriesStore = new RepositoriesStore(db)

  beforeEach(async () => {
    db = new TestRepositoriesDatabase()
    await db.reset()
    categoriesStore = new CategoriesStore(db)
    repositoriesStore = new RepositoriesStore(db)
  })

  describe('create', () => {
    it('persists a new category and returns it', async () => {
      const created = await categoriesStore.create('Work')
      assert.ok(created)
      assert.equal(created!.name, 'Work')

      const all = await categoriesStore.getAll()
      assert.equal(all.length, 1)
      assert.equal(all[0].name, 'Work')
    })

    it('trims the name', async () => {
      const created = await categoriesStore.create('  Work  ')
      assert.equal(created!.name, 'Work')
    })

    it('returns null when the trimmed name is empty', async () => {
      const result = await categoriesStore.create('   ')
      assert.equal(result, null)
    })

    it('rejects a case-insensitive duplicate', async () => {
      await categoriesStore.create('Work')
      const dup = await categoriesStore.create('WORK')
      assert.equal(dup, null)
      const all = await categoriesStore.getAll()
      assert.equal(all.length, 1)
    })
  })

  describe('rename', () => {
    it('persists the new name', async () => {
      const created = await categoriesStore.create('Work')
      const ok = await categoriesStore.rename(created!.id, 'Job')
      assert.equal(ok, true)
      const all = await categoriesStore.getAll()
      assert.equal(all[0].name, 'Job')
    })

    it('treats a case-only change as a no-op success', async () => {
      const created = await categoriesStore.create('Work')
      const ok = await categoriesStore.rename(created!.id, 'WORK')
      assert.equal(ok, true)
      const all = await categoriesStore.getAll()
      assert.equal(all[0].name, 'Work')
    })

    it('rejects renaming to a name another category already uses', async () => {
      await categoriesStore.create('Work')
      const other = await categoriesStore.create('Personal')
      const ok = await categoriesStore.rename(other!.id, 'work')
      assert.equal(ok, false)
      const all = await categoriesStore.getAll()
      assert.deepEqual(
        all.map(c => c.name).sort(),
        ['Personal', 'Work']
      )
    })

    it('returns false when the trimmed name is empty', async () => {
      const created = await categoriesStore.create('Work')
      const ok = await categoriesStore.rename(created!.id, '   ')
      assert.equal(ok, false)
    })
  })

  describe('delete', () => {
    it('removes the category', async () => {
      const created = await categoriesStore.create('Work')
      await categoriesStore.delete(created!.id)
      const all = await categoriesStore.getAll()
      assert.equal(all.length, 0)
    })

    it('clears categoryId on every repository that referenced it', async () => {
      const cat = await categoriesStore.create('Work')
      const repoA = await repositoriesStore.addRepository(
        '/tmp/a',
        '/tmp/a/.git'
      )
      const repoB = await repositoriesStore.addRepository(
        '/tmp/b',
        '/tmp/b/.git'
      )
      await repositoriesStore.updateRepositoryCategoryId(repoA, cat!.id)
      await repositoriesStore.updateRepositoryCategoryId(repoB, cat!.id)

      await categoriesStore.delete(cat!.id)

      const repos = await repositoriesStore.getAll()
      assert.equal(repos.length, 2)
      for (const r of repos) {
        assert.equal(r.categoryId, null)
      }
    })

    it('is a no-op for repositories that pointed elsewhere', async () => {
      const cat = await categoriesStore.create('Work')
      const other = await categoriesStore.create('Personal')
      const repo = await repositoriesStore.addRepository(
        '/tmp/r',
        '/tmp/r/.git'
      )
      await repositoriesStore.updateRepositoryCategoryId(repo, other!.id)

      await categoriesStore.delete(cat!.id)

      const repos = await repositoriesStore.getAll()
      assert.equal(repos[0].categoryId, other!.id)
    })
  })

  describe('getAll', () => {
    it('returns categories sorted case-insensitively by name', async () => {
      await categoriesStore.create('zeta')
      await categoriesStore.create('Alpha')
      await categoriesStore.create('beta')

      const all = await categoriesStore.getAll()
      assert.deepEqual(
        all.map(c => c.name),
        ['Alpha', 'beta', 'zeta']
      )
    })
  })
})
