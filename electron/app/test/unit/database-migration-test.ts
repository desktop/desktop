import { describe, it } from 'node:test'
import assert from 'node:assert'
import { BaseDatabase } from '../../src/lib/databases/base-database'

let dbCounter = 0

/**
 * A concrete test database that exposes conditionalVersion for testing.
 */
class TestDatabase extends BaseDatabase {
  public constructor(schemaVersion: number | undefined) {
    super(`TestDatabase-${++dbCounter}`, schemaVersion)
  }

  public async configure() {
    await this.conditionalVersion(1, { items: '++id' })
    await this.conditionalVersion(2, { items: '++id, name' })
    await this.conditionalVersion(3, { items: '++id, name, status' })
  }
}

describe('BaseDatabase', () => {
  describe('conditionalVersion', () => {
    it('registers all versions when schemaVersion is undefined', async () => {
      const db = new TestDatabase(undefined)
      await db.configure()

      // When schemaVersion is undefined, all versions should be registered.
      // We verify by opening the database — if versions weren't registered,
      // Dexie would throw.
      await db.open()
      assert.ok(db.isOpen())
      db.close()
    })

    it('registers all versions when schemaVersion equals the highest', async () => {
      const db = new TestDatabase(3)
      await db.configure()
      await db.open()
      assert.ok(db.isOpen())
      db.close()
    })

    it('skips versions higher than schemaVersion', async () => {
      // With schemaVersion=1, versions 2+ should be skipped since
      // conditionalVersion checks `schemaVersion < version`
      const db = new TestDatabase(1)
      await db.configure()
      await db.open()
      assert.ok(db.isOpen())
      const indexes = db.table('items').schema.indexes.map(i => i.name)
      assert.equal(indexes.includes('name'), false)
      assert.equal(indexes.includes('status'), false)
      db.close()
    })
  })
})
