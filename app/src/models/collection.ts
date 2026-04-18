/** Maximum depth of nesting for collections (root = level 1). */
export const MAX_COLLECTION_DEPTH = 5

/** A collection as stored in the database. */
export interface ICollection {
  readonly id: number
  readonly parentId: number | null
  readonly name: string
  readonly displayOrder: number
  readonly isExpanded: boolean
}

/** A collection with its children (subfolders and repository IDs) assembled. */
export interface ICollectionWithChildren extends ICollection {
  readonly childCollections: ReadonlyArray<ICollectionWithChildren>
  readonly repositoryIds: ReadonlyArray<number>
}
