import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as React from 'react'

import { Dialog, DialogStackContext } from '../../../src/ui/dialog/dialog'
import { render, screen } from '../../helpers/ui/render'

const showModalDescriptor = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  'showModal'
)
const closeDescriptor = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  'close'
)
let restoreIpcSend: (() => void) | null = null

describe('Dialog focus', () => {
  beforeEach(async () => {
    const electron = await import('electron')
    const previousSend = electron.ipcRenderer.send
    electron.ipcRenderer.send = () => {}
    restoreIpcSend = () => {
      electron.ipcRenderer.send = previousSend
      restoreIpcSend = null
    }

    HTMLDialogElement.prototype.showModal = function () {
      this.open = true
      this.focus()
    }
    HTMLDialogElement.prototype.close = function () {
      this.open = false
    }
  })

  afterEach(() => {
    restoreIpcSend?.()

    if (showModalDescriptor === undefined) {
      Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
    } else {
      Object.defineProperty(
        HTMLDialogElement.prototype,
        'showModal',
        showModalDescriptor
      )
    }

    if (closeDescriptor === undefined) {
      Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
    } else {
      Object.defineProperty(
        HTMLDialogElement.prototype,
        'close',
        closeDescriptor
      )
    }
  })

  it('does not restore focus to the dialog element', () => {
    const renderDialog = (isTopMost: boolean) => (
      <DialogStackContext.Provider value={{ isTopMost }}>
        <Dialog title="Configure provider">
          <button>First action</button>
          <button>Open nested dialog</button>
        </Dialog>
      </DialogStackContext.Provider>
    )

    const view = render(renderDialog(true))
    const dialog = screen.getByRole('dialog')
    const trigger = screen.getByRole('button', {
      name: 'Open nested dialog',
    })

    trigger.focus()
    dialog.focus()

    view.rerender(renderDialog(false))
    view.rerender(renderDialog(true))

    assert.strictEqual(document.activeElement, trigger)
    view.unmount()
  })

  it('falls back when the previously focused element cannot be focused', () => {
    const renderDialog = (isTopMost: boolean, triggerDisabled: boolean) => (
      <DialogStackContext.Provider value={{ isTopMost }}>
        <Dialog title="Configure provider">
          <button>First action</button>
          <button disabled={triggerDisabled}>Open nested dialog</button>
        </Dialog>
      </DialogStackContext.Provider>
    )

    const view = render(renderDialog(true, false))
    try {
      const firstAction = screen.getByRole('button', { name: 'First action' })
      const trigger = screen.getByRole('button', {
        name: 'Open nested dialog',
      })

      trigger.focus()

      view.rerender(renderDialog(false, true))
      view.rerender(renderDialog(true, true))

      assert.strictEqual(document.activeElement, firstAction)
    } finally {
      view.unmount()
    }
  })

  it('restores initial focus when dialog contents change while nested', () => {
    const renderDialog = (isTopMost: boolean, showNewFirstAction: boolean) => (
      <DialogStackContext.Provider value={{ isTopMost }}>
        <Dialog title="Configure provider">
          {showNewFirstAction ? <button>New first action</button> : null}
          <button>Open nested dialog</button>
        </Dialog>
      </DialogStackContext.Provider>
    )

    const view = render(renderDialog(true, false))
    try {
      const trigger = screen.getByRole('button', {
        name: 'Open nested dialog',
      })

      assert.strictEqual(document.activeElement, trigger)

      view.rerender(renderDialog(false, true))
      view.rerender(renderDialog(true, true))

      assert.strictEqual(document.activeElement, trigger)
    } finally {
      view.unmount()
    }
  })
})
