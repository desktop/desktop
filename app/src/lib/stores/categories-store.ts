import {
  RepositoriesDatabase,
  IDatabaseCategory,
} from '../databases/repositories-database'
import { Category } from '../../models/category'
import { assertNonNullable } from '../fatal-error'
import { TypedBaseStore } from './base-store'

/** The store for user-defined repository categories. */
export class CategoriesStore extends TypedBaseStore<ReadonlyArray<Category>> {
  private emitQueued = false

  public constructor(private readonly db: RepositoriesDatabase) {
    super()
  }

  /** Get all categories ordered by name (case-insensitive). */
  public getAll(): Promise<ReadonlyArray<Category>> {
    return this.db.transaction('r', this.db.categories, async () => {
      const records = await this.db.categories.toArray()
      const categories = records.map(toCategory)
      categories.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      )
      return categories
    })
  }

  /**
   * Create a new category. Rejects (returns null) when a category with the
   * same case-insensitive name already exists.
   */
  public async create(name: string): Promise<Category | null> {
    const trimmed = name.trim()
    if (trimmed.length === 0) {
      return null
    }

    const created = await this.db.transaction(
      'rw',
      this.db.categories,
      async () => {
        const existing = await this.findByNameCaseInsensitive(trimmed)
        if (existing !== undefined) {
          return null
        }

        const record: IDatabaseCategory = {
          name: trimmed,
          color: null,
          sortOrder: null,
        }
        const id = await this.db.categories.add(record)
        return toCategory({ ...record, id })
      }
    )

    if (created !== null) {
      this.emitUpdatedCategories()
    }

    return created
  }

  /**
   * Rename an existing category. No-ops when the trimmed name is empty or
   * matches the existing name case-insensitively. Rejects (returns false)
   * when another category already uses the same case-insensitive name.
   */
  public async rename(id: number, name: string): Promise<boolean> {
    const trimmed = name.trim()
    if (trimmed.length === 0) {
      return false
    }

    const result = await this.db.transaction(
      'rw',
      this.db.categories,
      async () => {
        const existing = await this.db.categories.get(id)
        if (existing === undefined) {
          return false
        }
        if (existing.name.toLowerCase() === trimmed.toLowerCase()) {
          // Same name (case-insensitive) — quietly succeed without writing.
          return true
        }
        const conflict = await this.findByNameCaseInsensitive(trimmed)
        if (conflict !== undefined && conflict.id !== id) {
          return false
        }
        await this.db.categories.update(id, { name: trimmed })
        return true
      }
    )

    if (result) {
      this.emitUpdatedCategories()
    }

    return result
  }

  /**
   * Delete a category. Any repositories currently assigned to it have their
   * `categoryId` cleared so they fall back to their default sidebar group.
   * Runs in a single transaction so the unassign and the delete either both
   * succeed or both roll back.
   */
  public async delete(id: number): Promise<void> {
    await this.db.transaction(
      'rw',
      this.db.categories,
      this.db.repositories,
      async () => {
        await this.db.repositories
          .where('categoryId')
          .equals(id)
          .modify({ categoryId: null })
        await this.db.categories.delete(id)
      }
    )

    this.emitUpdatedCategories()
  }

  private async findByNameCaseInsensitive(
    name: string
  ): Promise<IDatabaseCategory | undefined> {
    const lower = name.toLowerCase()
    return this.db.categories
      .filter(c => c.name.toLowerCase() === lower)
      .first()
  }

  private emitUpdatedCategories() {
    if (this.emitQueued) {
      return
    }
    setImmediate(() => {
      this.getAll()
        .then(categories => this.emitUpdate(categories))
        .catch(e => log.error(`Failed emitting category update`, e))
        .finally(() => (this.emitQueued = false))
    })
    this.emitQueued = true
  }
}

function toCategory(record: IDatabaseCategory): Category {
  assertNonNullable(record.id, "can't convert to Category without id")
  return new Category(
    record.id,
    record.name,
    record.color ?? null,
    record.sortOrder ?? null
  )
}
