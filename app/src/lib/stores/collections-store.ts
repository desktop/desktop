import {
  RepositoriesDatabase,
  IDatabaseCollection,
} from '../databases/repositories-database'
import { ICollection, MAX_COLLECTION_DEPTH } from '../../models/collection'
import { TypedBaseStore } from './base-store'
import { assertNonNullable } from '../fatal-error'

/** Store for user-defined collections organizing the repository list. */
export class CollectionsStore extends TypedBaseStore<
  ReadonlyArray<ICollection>
> {
  public constructor(private readonly db: RepositoriesDatabase) {
    super()
  }

  /** Return all collections, ordered by parentId then displayOrder. */
  public async getAll(): Promise<ReadonlyArray<ICollection>> {
    const rows = await this.db.collections.toArray()
    return rows.map(toCollection).sort((a, b) => {
      const aParent = a.parentId ?? -1
      const bParent = b.parentId ?? -1
      if (aParent !== bParent) {
        return aParent - bParent
      }
      return a.displayOrder - b.displayOrder
    })
  }

  /**
   * Create a new collection under the given parent (null for root).
   * The new collection is appended to the end of its siblings.
   */
  public async createCollection(
    name: string,
    parentId: number | null
  ): Promise<ICollection> {
    if (parentId !== null) {
      const parentDepth = await this.getCollectionDepth(parentId)
      if (parentDepth + 1 > MAX_COLLECTION_DEPTH) {
        throw new Error(
          `Cannot create collection: maximum depth of ${MAX_COLLECTION_DEPTH} would be exceeded`
        )
      }
    }

    const collection = await this.db.transaction(
      'rw',
      this.db.collections,
      async () => {
        // Dexie's where({parentId: null}) does not match null values reliably
        // across all index configurations — full-scan filter instead.
        const all = await this.db.collections.toArray()
        const siblings = all.filter(f => f.parentId === parentId)
        const displayOrder = siblings.length
        const id = await this.db.collections.add({
          parentId,
          name,
          displayOrder,
          isExpanded: true,
        })
        return { id, parentId, name, displayOrder, isExpanded: true }
      }
    )

    this.emitUpdate(await this.getAll())
    return collection
  }

  /** Rename a collection. */
  public async renameCollection(id: number, name: string): Promise<void> {
    await this.db.collections.update(id, { name })
    this.emitUpdate(await this.getAll())
  }

  /**
   * Delete a collection. Contents promotion is handled by a separate method
   * (deleteCollectionPromoteChildren); this method only deletes empty collections.
   */
  public async deleteCollection(id: number): Promise<void> {
    await this.db.transaction('rw', this.db.collections, async () => {
      const collection = await this.db.collections.get(id)
      if (collection === undefined) {
        return
      }
      await this.db.collections.delete(id)
      await this.rebalanceSiblings(collection.parentId)
    })
    this.emitUpdate(await this.getAll())
  }

  /**
   * Move a collection under a new parent (null = root). Appended to the end of
   * new siblings. Rejects cycles and moves that exceed depth 5.
   */
  public async moveCollection(
    id: number,
    newParentId: number | null
  ): Promise<void> {
    if (newParentId === id) {
      throw new Error('Cannot move a collection under itself')
    }

    if (newParentId !== null && (await this.isDescendantOf(newParentId, id))) {
      throw new Error('Cannot move a collection under its own descendant')
    }

    const subtreeDepth = await this.getSubtreeDepth(id)
    const newParentDepth =
      newParentId === null ? 0 : await this.getCollectionDepth(newParentId)
    if (newParentDepth + subtreeDepth > MAX_COLLECTION_DEPTH) {
      throw new Error(
        `Cannot move collection: resulting depth would exceed ${MAX_COLLECTION_DEPTH}`
      )
    }

    await this.db.transaction('rw', this.db.collections, async () => {
      const collection = await this.db.collections.get(id)
      if (collection === undefined) {
        return
      }

      const all = await this.db.collections.toArray()
      const newSiblings = all.filter(
        f => f.parentId === newParentId && f.id !== id
      )
      const newDisplayOrder = newSiblings.length

      await this.db.collections.update(id, {
        parentId: newParentId,
        displayOrder: newDisplayOrder,
      })
      await this.rebalanceSiblings(collection.parentId)
    })

    this.emitUpdate(await this.getAll())
  }

  /** Set the persisted expand/collapse state of a collection. */
  public async setExpanded(id: number, isExpanded: boolean): Promise<void> {
    await this.db.collections.update(id, { isExpanded })
    this.emitUpdate(await this.getAll())
  }

  /**
   * Delete a collection and promote its direct subfolders to the deleted collection's
   * parent level. Repositories inside the collection are NOT touched here — the
   * RepositoriesStore caller is responsible for clearing collectionId on affected
   * repos (see app-store._deleteCollection for the orchestration).
   */
  public async deleteCollectionPromoteChildren(id: number): Promise<void> {
    await this.db.transaction('rw', this.db.collections, async () => {
      const collection = await this.db.collections.get(id)
      if (collection === undefined) {
        return
      }

      const all = await this.db.collections.toArray()
      const children = all
        .filter(f => f.parentId === id)
        .sort((a, b) => a.displayOrder - b.displayOrder)

      const newSiblings = all.filter(
        f => f.parentId === collection.parentId && f.id !== id
      )
      let nextOrder = newSiblings.length

      for (const child of children) {
        await this.db.collections.update(child.id!, {
          parentId: collection.parentId,
          displayOrder: nextOrder,
        })
        nextOrder++
      }

      await this.db.collections.delete(id)
      await this.rebalanceSiblings(collection.parentId)
    })
    this.emitUpdate(await this.getAll())
  }

  /**
   * Move a collection to a new position within its current parent.
   * `newIndex` is clamped to [0, siblings.length-1].
   */
  public async reorderCollection(id: number, newIndex: number): Promise<void> {
    await this.db.transaction('rw', this.db.collections, async () => {
      const collection = await this.db.collections.get(id)
      if (collection === undefined) {
        return
      }

      const all = await this.db.collections.toArray()
      const siblings = all
        .filter(f => f.parentId === collection.parentId)
        .sort((a, b) => a.displayOrder - b.displayOrder)

      const currentIndex = siblings.findIndex(f => f.id === id)
      if (currentIndex === -1) {
        return
      }

      const clamped = Math.max(0, Math.min(siblings.length - 1, newIndex))
      if (clamped === currentIndex) {
        return
      }

      const [moved] = siblings.splice(currentIndex, 1)
      siblings.splice(clamped, 0, moved)

      for (let i = 0; i < siblings.length; i++) {
        if (siblings[i].displayOrder !== i) {
          await this.db.collections.update(siblings[i].id!, { displayOrder: i })
        }
      }
    })
    this.emitUpdate(await this.getAll())
  }

  /** Is `candidateDescendantId` a descendant of (or equal to) `ancestorId`? */
  private async isDescendantOf(
    candidateDescendantId: number,
    ancestorId: number
  ): Promise<boolean> {
    let currentId: number | null = candidateDescendantId
    const visited = new Set<number>()
    while (currentId !== null) {
      if (visited.has(currentId)) {
        return false
      }
      visited.add(currentId)
      if (currentId === ancestorId) {
        return true
      }
      const collection: IDatabaseCollection | undefined =
        await this.db.collections.get(currentId)
      if (collection === undefined) {
        return false
      }
      currentId = collection.parentId
    }
    return false
  }

  /** Depth of the subtree rooted at id (a leaf collection has depth 1). */
  private async getSubtreeDepth(id: number): Promise<number> {
    const all = await this.db.collections.toArray()
    const walk = (currentId: number): number => {
      const children = all.filter(f => f.parentId === currentId)
      if (children.length === 0) {
        return 1
      }
      return 1 + Math.max(...children.map(c => walk(c.id!)))
    }
    return walk(id)
  }

  /**
   * Return the depth of the collection identified by id (root collections have depth 1).
   * Throws if a cycle is detected or an ancestor is missing.
   */
  private async getCollectionDepth(id: number): Promise<number> {
    let depth = 1
    let currentId: number | null = id
    const visited = new Set<number>()

    while (currentId !== null) {
      if (visited.has(currentId)) {
        throw new Error(`Cycle detected at collection ${currentId}`)
      }
      visited.add(currentId)

      const collection: IDatabaseCollection | undefined =
        await this.db.collections.get(currentId)
      if (collection === undefined) {
        throw new Error(`Missing collection ${currentId} in ancestor chain`)
      }
      currentId = collection.parentId
      if (currentId !== null) {
        depth++
      }
    }

    return depth
  }

  /**
   * Reassign displayOrder to 0..n-1 for all collections sharing the given parent.
   * Must be called inside a 'rw' transaction on the collections table.
   */
  private async rebalanceSiblings(parentId: number | null): Promise<void> {
    const all = await this.db.collections.toArray()
    const siblings = all
      .filter(f => f.parentId === parentId)
      .sort((a, b) => a.displayOrder - b.displayOrder)

    for (let i = 0; i < siblings.length; i++) {
      if (siblings[i].displayOrder !== i) {
        await this.db.collections.update(siblings[i].id!, { displayOrder: i })
      }
    }
  }
}

function toCollection(row: IDatabaseCollection): ICollection {
  assertNonNullable(row.id, 'collection row missing id')
  return {
    id: row.id,
    parentId: row.parentId,
    name: row.name,
    displayOrder: row.displayOrder,
    isExpanded: row.isExpanded,
  }
}
