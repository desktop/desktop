import assert from 'node:assert'
import { describe, it } from 'node:test'

import { Repository } from '../../src/models/repository'
import { groupRepositories } from '../../src/ui/repositories-list/group-repositories'
import {
  assignRepositoryToFolder,
  createRepositoryFolder,
} from '../../src/ui/repositories-list/repository-folder-store'

describe('group-repositories folders', () => {
  it('places assigned repositories in their custom folder group', () => {
    const alpha = new Repository('C:/Repos/alpha', 1, null, false)
    const beta = new Repository('C:/Repos/beta', 2, null, false)
    const created = createRepositoryFolder(
      { folders: [], assignments: {} },
      'Pinned'
    )
    const folderStore = assignRepositoryToFolder(
      created.store,
      alpha.id,
      created.folder.id
    )

    const groups = groupRepositories([alpha, beta], new Map(), [], folderStore)

    assert.strictEqual(groups[0].identifier.kind, 'folder')
    assert.strictEqual(groups[0].items[0].repository.id, alpha.id)
    assert.strictEqual(groups[1].identifier.kind, 'other')
    assert.strictEqual(groups[1].items[0].repository.id, beta.id)
  })
})
