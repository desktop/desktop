import assert from 'node:assert'
import { describe, it } from 'node:test'

import { AppStore } from '../../src/lib/stores/app-store'
import { DiffSelection, DiffSelectionType } from '../../src/models/diff'
import { Popup, PopupType } from '../../src/models/popup'
import { Repository } from '../../src/models/repository'
import {
  AppFileStatusKind,
  GitStatusEntry,
  WorkingDirectoryFileChange,
  WorkingDirectoryStatus,
} from '../../src/models/status'

function conflictedFile() {
  return new WorkingDirectoryFileChange(
    'src/conflict.ts',
    {
      kind: AppFileStatusKind.Conflicted,
      entry: {
        kind: 'conflicted',
        action: 'both-modified' as any,
        us: GitStatusEntry.UpdatedButUnmerged,
        them: GitStatusEntry.UpdatedButUnmerged,
      },
      conflictMarkerCount: 1,
    },
    DiffSelection.fromInitialSelection(DiffSelectionType.All)
  )
}

function createGuardedStore(
  workingDirectory: WorkingDirectoryStatus,
  popups: Array<Popup>
): AppStore {
  const store = Object.create(AppStore.prototype) as any

  store.repositoryStateCache = {
    get: () => ({
      changesState: {
        conflictState: null,
        workingDirectory,
      },
    }),
  }
  store.pendingStashRestoreEntries = new Map()
  store._showPopup = async (popup: Popup) => {
    popups.push(popup)
  }

  return store as AppStore
}

describe('AppStore commit message conflict guard', () => {
  it('blocks direct generation before account, disclaimer, diff, or API work', async () => {
    const repository = new Repository('/tmp/repo', 1, null, false)
    const selectedFiles = [conflictedFile()]
    const workingDirectory = WorkingDirectoryStatus.fromFiles(selectedFiles)
    const popups = new Array<Popup>()
    const store = createGuardedStore(workingDirectory, popups)

    const generated = await store._generateCommitMessage(
      repository,
      selectedFiles
    )

    assert.equal(generated, false)
    assert.equal(popups.length, 1)
    assert.equal(popups[0].type, PopupType.ResolveConflictsWithCopilot)
  })

  it('blocks override warning before showing the override dialog', async () => {
    const repository = new Repository('/tmp/repo', 1, null, false)
    const selectedFiles = [conflictedFile()]
    const workingDirectory = WorkingDirectoryStatus.fromFiles(selectedFiles)
    const popups = new Array<Popup>()
    const store = createGuardedStore(workingDirectory, popups)
    ;(store as any).confirmCommitMessageOverride = true

    await store._promptOverrideWithGeneratedCommitMessage(
      repository,
      selectedFiles
    )

    assert.equal(popups.length, 1)
    assert.equal(popups[0].type, PopupType.ResolveConflictsWithCopilot)
  })
})
