/**
 * A user-defined category for grouping repositories in the sidebar.
 *
 * `color` and `sortOrder` are persisted now but unused in MVP 1 — they exist
 * to avoid a schema bump when MVP 2 (per-category color) and MVP 3 (manual
 * reordering) land.
 */
export class Category {
  public constructor(
    public readonly id: number,
    public readonly name: string,
    public readonly color: string | null = null,
    public readonly sortOrder: number | null = null
  ) {}

  public withName(name: string): Category {
    return new Category(this.id, name, this.color, this.sortOrder)
  }
}
