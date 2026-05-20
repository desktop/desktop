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
