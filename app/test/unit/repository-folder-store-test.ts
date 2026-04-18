import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  assignRepositoryToFolder,
  createRepositoryFolder,
  getRepositoryFolderId,
  hasFolderName,
  replaceRepositoryFolders,
} from '../../src/ui/repositories-list/repository-folder-store'

describe('repository-folder-store', () => {
  it('creates folders and assigns repositories to them', () => {
    const { folder, store } = createRepositoryFolder(
      { folders: [], assignments: {} },
      'Favorites'
    )
    const updated = assignRepositoryToFolder(store, 42, folder.id)

    assert.strictEqual(updated.folders[0].name, 'Favorites')
    assert.strictEqual(getRepositoryFolderId(updated, 42), folder.id)
  })

  it('removes assignments for deleted folders when replacing folder definitions', () => {
    const favorites = createRepositoryFolder(
      { folders: [], assignments: {} },
      'Favorites'
    )
    const work = createRepositoryFolder(favorites.store, 'Work')
    const assigned = assignRepositoryToFolder(work.store, 7, work.folder.id)
    const replaced = replaceRepositoryFolders(assigned, [favorites.folder])

    assert.strictEqual(getRepositoryFolderId(replaced, 7), null)
  })

  it('checks folder names case-insensitively', () => {
    const { store } = createRepositoryFolder(
      { folders: [], assignments: {} },
      'Favorites'
    )

    assert.strictEqual(hasFolderName(store, 'favorites'), true)
    assert.strictEqual(hasFolderName(store, 'Work'), false)
  })
})
