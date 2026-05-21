import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { AppStore } from '../../src/lib/stores/app-store'
import { FoldoutType } from '../../src/lib/app-state'
import { Repository } from '../../src/models/repository'

const originalLocalStorage = globalThis.localStorage

class TestLocalStorage {
  private readonly values = new Map<string, string>()

  public getItem(key: string) {
    return this.values.get(key) ?? null
  }

  public setItem(key: string, value: string) {
    this.values.set(key, value)
  }

  public removeItem(key: string) {
    this.values.delete(key)
  }

  public clear() {
    this.values.clear()
  }
}

function repository(id: number) {
  return { id } as Repository
}

function createStoreHarness(repositoryIndicatorsEnabled = true) {
  let refreshRequests = 0
  let stopped = false

  const store: any = Object.create(AppStore.prototype)

  store.repositoryIndicatorsEnabled = repositoryIndicatorsEnabled
  store.repositoryIndicatorUpdater = {
    requestRefresh: () => {
      refreshRequests++
    },
    stop: () => {
      stopped = true
    },
  }
  store.emitUpdate = () => {}
  store.emitUpdateNow = () => {}
  store.updateRepositorySelectionAfterRepositoriesChanged = () => {}
  store.accountsStore = { getAll: async () => [], refresh: async () => {} }
  store.repositoriesStore = { getAll: async () => [repository(1)] }
  store.updateMenuLabelsForSelectedRepository = () => {}

  return {
    store,
    get refreshRequests() {
      return refreshRequests
    },
    get stopped() {
      return stopped
    },
  }
}

beforeEach(() => {
  ;(globalThis as any).localStorage = new TestLocalStorage()
})

afterEach(() => {
  ;(globalThis as any).localStorage = originalLocalStorage
})

describe('AppStore repository indicator refresh triggers', () => {
  it('requests a startup refresh after initial repositories load', async () => {
    const harness = createStoreHarness()
    const electron = await import('electron')
    const previousSend = electron.ipcRenderer.send
    const previousInvoke = electron.ipcRenderer.invoke
    electron.ipcRenderer.send = () => {}
    electron.ipcRenderer.invoke = async () => false

    try {
      await harness.store.loadInitialState()
    } finally {
      electron.ipcRenderer.send = previousSend
      electron.ipcRenderer.invoke = previousInvoke
    }

    assert.equal(harness.refreshRequests, 1)
  })

  it('does not request startup refreshes when indicators are disabled', async () => {
    const harness = createStoreHarness(false)
    const electron = await import('electron')
    const previousSend = electron.ipcRenderer.send
    const previousInvoke = electron.ipcRenderer.invoke
    electron.ipcRenderer.send = () => {}
    electron.ipcRenderer.invoke = async () => false

    try {
      await harness.store.loadInitialState()
    } finally {
      electron.ipcRenderer.send = previousSend
      electron.ipcRenderer.invoke = previousInvoke
    }

    assert.equal(harness.refreshRequests, 0)
  })

  it('requests a refresh when the repository foldout opens', async () => {
    const harness = createStoreHarness()

    await harness.store._showFoldout({ type: FoldoutType.Repository })

    assert.equal(harness.refreshRequests, 1)
  })

  it('requests a refresh when repository indicators are re-enabled', () => {
    const harness = createStoreHarness(false)

    harness.store._setRepositoryIndicatorsEnabled(true)

    assert.equal(harness.refreshRequests, 1)
    assert.equal(harness.stopped, false)
  })

  it('stops the updater when repository indicators are disabled', () => {
    const harness = createStoreHarness(true)

    harness.store._setRepositoryIndicatorsEnabled(false)

    assert.equal(harness.stopped, true)
    assert.equal(harness.refreshRequests, 0)
  })
})
