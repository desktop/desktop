import { ICollection, ICollectionWithChildren } from '../../models/collection'

/** Pure function: takes flat collections + per-repo collection state, returns nested tree. */
export function buildCollectionTree(
  collections: ReadonlyArray<ICollection>,
  repositoryFolderStates: ReadonlyMap<
    number,
    { collectionId: number | null; collectionDisplayOrder: number | null }
  >
): ReadonlyArray<ICollectionWithChildren> {
  const reposByFolder = new Map<number, Array<{ id: number; order: number }>>()
  for (const [repoId, state] of repositoryFolderStates) {
    if (state.collectionId === null) {
      continue
    }
    const bucket = reposByFolder.get(state.collectionId) ?? []
    bucket.push({ id: repoId, order: state.collectionDisplayOrder ?? 0 })
    reposByFolder.set(state.collectionId, bucket)
  }

  for (const bucket of reposByFolder.values()) {
    bucket.sort((a, b) => a.order - b.order)
  }

  const childrenByParent = new Map<number | null, ICollection[]>()
  for (const f of collections) {
    const siblings = childrenByParent.get(f.parentId) ?? []
    siblings.push(f)
    childrenByParent.set(f.parentId, siblings)
  }

  for (const siblings of childrenByParent.values()) {
    siblings.sort((a, b) => a.displayOrder - b.displayOrder)
  }

  const build = (parentId: number | null): ICollectionWithChildren[] => {
    const siblings = childrenByParent.get(parentId) ?? []
    return siblings.map(collection => ({
      ...collection,
      childCollections: build(collection.id),
      repositoryIds: (reposByFolder.get(collection.id) ?? []).map(r => r.id),
    }))
  }

  return build(null)
}
