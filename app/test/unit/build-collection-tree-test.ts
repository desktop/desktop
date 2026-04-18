import { describe, it } from 'node:test'
import assert from 'node:assert'
import { buildCollectionTree } from '../../src/ui/repositories-list/build-collection-tree'
import {
  ICollection,
  ICollectionWithChildren,
} from '../../src/models/collection'

describe('buildCollectionTree', () => {
  const collections: ICollection[] = [
    { id: 1, parentId: null, name: 'Work', displayOrder: 0, isExpanded: true },
    {
      id: 2,
      parentId: null,
      name: 'Personal',
      displayOrder: 1,
      isExpanded: true,
    },
    { id: 3, parentId: 1, name: 'Sub', displayOrder: 0, isExpanded: true },
  ]

  const folderStates = new Map<
    number,
    { collectionId: number | null; collectionDisplayOrder: number | null }
  >([
    [101, { collectionId: 1, collectionDisplayOrder: 0 }],
    [102, { collectionId: 1, collectionDisplayOrder: 1 }],
    [103, { collectionId: 3, collectionDisplayOrder: 0 }],
    [104, { collectionId: null, collectionDisplayOrder: null }],
  ])

  it('builds nested tree with repos sorted by collectionDisplayOrder', () => {
    const tree = buildCollectionTree(collections, folderStates)
    assert.equal(tree.length, 2)
    assert.equal(tree[0].name, 'Work')
    assert.deepEqual(tree[0].repositoryIds, [101, 102])
    assert.equal(tree[0].childCollections.length, 1)
    assert.equal(tree[0].childCollections[0].name, 'Sub')
    assert.deepEqual(tree[0].childCollections[0].repositoryIds, [103])
    assert.equal(tree[1].name, 'Personal')
    assert.deepEqual(tree[1].repositoryIds, [])
  })

  it('ignores repositories with no collection placement', () => {
    const tree = buildCollectionTree(collections, folderStates)
    const allIds = collectIds(tree)
    assert.ok(!allIds.includes(104))
  })

  it('orders top-level collections by displayOrder', () => {
    const reordered: ICollection[] = [
      {
        id: 1,
        parentId: null,
        name: 'Work',
        displayOrder: 1,
        isExpanded: true,
      },
      {
        id: 2,
        parentId: null,
        name: 'Personal',
        displayOrder: 0,
        isExpanded: true,
      },
    ]
    const tree = buildCollectionTree(reordered, new Map())
    assert.deepEqual(
      tree.map(f => f.name),
      ['Personal', 'Work']
    )
  })
})

function collectIds(nodes: ReadonlyArray<ICollectionWithChildren>): number[] {
  const ids: number[] = []
  for (const node of nodes) {
    ids.push(...node.repositoryIds)
    ids.push(...collectIds(node.childCollections))
  }
  return ids
}
