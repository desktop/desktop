import { ICollectionWithChildren } from '../../models/collection'
import { IMenuItem } from '../../lib/menu-item'

/**
 * Build a "Move to Collection" submenu. Root entry + flattened collection paths.
 * Click handlers are wired by the caller via onMoveToCollection.
 */
export function buildMoveToCollectionMenu(
  collections: ReadonlyArray<ICollectionWithChildren>,
  onMoveToCollection: (collectionId: number | null) => void
): IMenuItem {
  const submenu: IMenuItem[] = [
    { label: '(Root — no collection)', action: () => onMoveToCollection(null) },
    { type: 'separator' },
    ...flatten(collections, '').map(({ id, path }) => ({
      label: path,
      action: () => onMoveToCollection(id),
    })),
  ]

  return {
    label: 'Move to Collection',
    submenu,
  }
}

function flatten(
  collections: ReadonlyArray<ICollectionWithChildren>,
  prefix: string
): Array<{ id: number; path: string }> {
  const result: Array<{ id: number; path: string }> = []
  for (const f of collections) {
    const path = prefix === '' ? f.name : `${prefix} › ${f.name}`
    result.push({ id: f.id, path })
    result.push(...flatten(f.childCollections, path))
  }
  return result
}
