export interface IMatches {
  readonly title: ReadonlyArray<number>
  readonly subtitle: ReadonlyArray<number>
}

export interface IMatch<T> {
  /** `0 <= score <= 1` */
  score: number
  item: T
  matches: IMatches
}

/** An item in the filter list. */
export interface IFilterListItem {
  /** The text which represents the item. This is used for filtering. */
  readonly text: ReadonlyArray<string>

  /** A unique identifier for the item. */
  readonly id: string
}

/** A group of items in the list. */
export interface IFilterListGroup<T extends IFilterListItem> {
  /** The identifier for this group. */
  readonly identifier: string

  /** The items in the group. */
  readonly items: ReadonlyArray<T>
}

export interface IFlattenedGroup {
  readonly kind: 'group'
  readonly identifier: string
}

export interface IFlattenedItem<T extends IFilterListItem> {
  readonly kind: 'item'
  readonly item: T
  /** Array of indexes in `item.text` that should be highlighted */
  readonly matches: IMatches
}
