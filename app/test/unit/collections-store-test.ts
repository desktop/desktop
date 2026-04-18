import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { CollectionsStore } from '../../src/lib/stores/collections-store'
import { TestRepositoriesDatabase } from '../helpers/databases'

describe('CollectionsStore', () => {
  let db = new TestRepositoriesDatabase()
  let store = new CollectionsStore(db)

  beforeEach(async () => {
    db = new TestRepositoriesDatabase()
    await db.reset()
    store = new CollectionsStore(db)
  })

  describe('createCollection', () => {
    it('creates a root collection with displayOrder 0', async () => {
      const collection = await store.createCollection('Work', null)
      assert.equal(collection.name, 'Work')
      assert.equal(collection.parentId, null)
      assert.equal(collection.displayOrder, 0)
      assert.equal(collection.isExpanded, true)
    })

    it('creates a second root collection with displayOrder 1', async () => {
      await store.createCollection('Work', null)
      const personal = await store.createCollection('Personal', null)
      assert.equal(personal.displayOrder, 1)
    })
  })

  describe('getAll', () => {
    it('returns all collections sorted by parent+displayOrder', async () => {
      const work = await store.createCollection('Work', null)
      await store.createCollection('Personal', null)
      await store.createCollection('Sub', work.id)

      const all = await store.getAll()
      assert.equal(all.length, 3)
      assert.equal(all[0].name, 'Work')
      assert.equal(all[1].name, 'Personal')
      assert.equal(all[2].name, 'Sub')
    })
  })

  describe('renameCollection', () => {
    it('renames a collection', async () => {
      const work = await store.createCollection('Work', null)
      await store.renameCollection(work.id, 'Projects')
      const all = await store.getAll()
      assert.equal(all[0].name, 'Projects')
    })
  })

  describe('deleteCollection (empty)', () => {
    it('removes an empty collection and rebalances siblings', async () => {
      await store.createCollection('A', null)
      const b = await store.createCollection('B', null)
      await store.createCollection('C', null)

      await store.deleteCollection(b.id)

      const all = await store.getAll()
      assert.equal(all.length, 2)
      assert.equal(all[0].name, 'A')
      assert.equal(all[0].displayOrder, 0)
      assert.equal(all[1].name, 'C')
      assert.equal(all[1].displayOrder, 1)
    })
  })

  describe('depth limit', () => {
    it('allows creating 5 levels deep', async () => {
      let parentId: number | null = null
      for (let level = 1; level <= 5; level++) {
        const collection = await store.createCollection(`L${level}`, parentId)
        parentId = collection.id
      }
      const all = await store.getAll()
      assert.equal(all.length, 5)
    })

    it('rejects creating a 6th nested level', async () => {
      let parentId: number | null = null
      for (let level = 1; level <= 5; level++) {
        const collection = await store.createCollection(`L${level}`, parentId)
        parentId = collection.id
      }
      await assert.rejects(
        () => store.createCollection('L6', parentId),
        /depth/i
      )
    })
  })

  describe('moveCollection', () => {
    it('moves a collection under a new parent', async () => {
      const work = await store.createCollection('Work', null)
      const personal = await store.createCollection('Personal', null)

      await store.moveCollection(personal.id, work.id)

      const all = await store.getAll()
      const moved = all.find(f => f.name === 'Personal')!
      assert.equal(moved.parentId, work.id)
      assert.equal(moved.displayOrder, 0)
    })

    it('rejects moving a collection under itself', async () => {
      const work = await store.createCollection('Work', null)
      await assert.rejects(
        () => store.moveCollection(work.id, work.id),
        /descendant|self/i
      )
    })

    it('rejects moving a collection under its own descendant', async () => {
      const a = await store.createCollection('A', null)
      const b = await store.createCollection('B', a.id)
      await assert.rejects(
        () => store.moveCollection(a.id, b.id),
        /descendant|self/i
      )
    })

    it('rejects a move that would exceed depth 5', async () => {
      let parentId: number | null = null
      const ids: number[] = []
      for (let level = 1; level <= 4; level++) {
        const f = await store.createCollection(`L${level}`, parentId)
        ids.push(f.id)
        parentId = f.id
      }
      const sibling = await store.createCollection('Sibling', null)
      await store.createCollection('Child', sibling.id)

      await assert.rejects(
        () => store.moveCollection(sibling.id, ids[3]),
        /depth/i
      )
    })
  })

  describe('reorderCollection', () => {
    it('moves a collection up in its sibling order', async () => {
      await store.createCollection('A', null)
      await store.createCollection('B', null)
      const c = await store.createCollection('C', null)

      await store.reorderCollection(c.id, 0)

      const all = await store.getAll()
      assert.deepEqual(
        all.map(f => f.name),
        ['C', 'A', 'B']
      )
    })

    it('moves a collection down', async () => {
      const a = await store.createCollection('A', null)
      await store.createCollection('B', null)
      await store.createCollection('C', null)

      await store.reorderCollection(a.id, 2)

      const all = await store.getAll()
      assert.deepEqual(
        all.map(f => f.name),
        ['B', 'C', 'A']
      )
    })
  })

  describe('setExpanded', () => {
    it('persists expand/collapse state', async () => {
      const work = await store.createCollection('Work', null)
      await store.setExpanded(work.id, false)
      const all = await store.getAll()
      assert.equal(all[0].isExpanded, false)
    })
  })

  describe('deleteCollectionPromoteChildren', () => {
    it('promotes subfolders to parent level when collection is deleted', async () => {
      const work = await store.createCollection('Work', null)
      await store.createCollection('Sub1', work.id)
      await store.createCollection('Sub2', work.id)

      await store.deleteCollectionPromoteChildren(work.id)

      const all = await store.getAll()
      assert.equal(all.length, 2)
      const promoted = all.filter(f => f.parentId === null)
      assert.equal(promoted.length, 2)
      assert.deepEqual(promoted.map(f => f.name).sort(), ['Sub1', 'Sub2'])
    })
  })
})
