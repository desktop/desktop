import assert from 'node:assert'
import { afterEach, describe, it, mock } from 'node:test'
import * as React from 'react'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

let valid = false
let pickedPath: string | null = null
const validatedPaths: string[] = []
mock.module('../../../src/lib/copilot-app', {
  namedExports: {
    validateCopilotAppPath: async (path: string) => {
      validatedPaths.push(path)
      return valid
    },
  },
})
mock.module('../../../src/ui/main-process-proxy', {
  namedExports: {
    showOpenDialog: async () => pickedPath,
    sendDialogDidOpen: () => {},
  },
})
async function getDialog() {
  return (await import('../../../src/ui/copilot-app/copilot-app-dialog'))
    .CopilotAppDialog
}

afterEach(() => {
  valid = false
  pickedPath = null
  validatedPaths.length = 0
})

describe('Copilot app dialog', () => {
  it('offers a download link and requires an app location', async () => {
    const CopilotAppDialog = await getDialog()
    render(
      <CopilotAppDialog
        repositoryPath="/worktrees/topic"
        message="GitHub Copilot could not be found."
        onDismissed={() => {}}
        onOpen={async () => {}}
      />
    )
    assert.strictEqual(
      screen
        .getByRole('link', { name: 'Download GitHub Copilot', hidden: true })
        .getAttribute('href'),
      'https://gh.io/app'
    )
    assert.strictEqual(
      screen
        .getByRole('button', { name: 'Open GitHub Copilot', hidden: true })
        .getAttribute('aria-disabled'),
      'true'
    )
    assert.ok(screen.getByText('GitHub Copilot could not be found.'))
  })

  it('rejects invalid paths without dismissing or handing off', async () => {
    const CopilotAppDialog = await getDialog()
    let dismissed = false
    let opened = false
    render(
      <CopilotAppDialog
        repositoryPath="/worktrees/topic"
        appPath="/missing"
        message="Could not open."
        onDismissed={() => {
          dismissed = true
        }}
        onOpen={async () => {
          opened = true
        }}
      />
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Open GitHub Copilot', hidden: true })
    )
    await waitFor(() =>
      assert.ok(
        screen.getByText(
          __DARWIN__
            ? 'Choose the GitHub Copilot application (.app).'
            : 'Choose the GitHub Copilot executable (github.exe).'
        )
      )
    )
    assert.deepStrictEqual(validatedPaths, ['/missing'])
    assert.strictEqual(dismissed, false)
    assert.strictEqual(opened, false)
  })

  it('preserves the exact worktree path when opening a manually entered app', async () => {
    const CopilotAppDialog = await getDialog()
    valid = true
    const calls: string[][] = []
    render(
      <CopilotAppDialog
        repositoryPath="/worktrees/topic with spaces"
        message="Could not open."
        onDismissed={() => {
          calls.push(['dismissed'])
        }}
        onOpen={async (repo, app) => {
          calls.push([repo, app])
        }}
      />
    )
    fireEvent.change(
      screen.getByRole('textbox', { name: 'App location', hidden: true }),
      {
        target: { value: '/custom/Copilot.app' },
      }
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Open GitHub Copilot', hidden: true })
    )
    await waitFor(() =>
      assert.deepStrictEqual(calls, [
        ['dismissed'],
        ['/worktrees/topic with spaces', '/custom/Copilot.app'],
      ])
    )
  })

  it('fills the app path from the picker without opening it automatically', async () => {
    const CopilotAppDialog = await getDialog()
    pickedPath = '/chosen/GitHub Copilot.app'
    let opened = false
    render(
      <CopilotAppDialog
        repositoryPath="/worktrees/topic"
        message="Could not open."
        onDismissed={() => {}}
        onOpen={async () => {
          opened = true
        }}
      />
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Choose...', hidden: true })
    )
    await waitFor(() => assert.ok(screen.getByDisplayValue(pickedPath ?? '')))
    assert.strictEqual(opened, false)
    assert.deepStrictEqual(validatedPaths, [])
  })

  it('cancels without launching or changing the app location', async t => {
    const CopilotAppDialog = await getDialog()
    const { DialogStackContext } = await import('../../../src/ui/dialog/dialog')
    const descriptor = Object.getOwnPropertyDescriptor(
      HTMLDialogElement.prototype,
      'showModal'
    )
    const closeDescriptor = Object.getOwnPropertyDescriptor(
      HTMLDialogElement.prototype,
      'close'
    )
    HTMLDialogElement.prototype.showModal = function () {
      this.open = true
    }
    HTMLDialogElement.prototype.close = function () {
      this.open = false
    }
    t.after(() => {
      if (descriptor === undefined) {
        Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
      } else {
        Object.defineProperty(
          HTMLDialogElement.prototype,
          'showModal',
          descriptor
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
    let dismissed = false
    let opened = false
    const view = render(
      <DialogStackContext.Provider value={{ isTopMost: true }}>
        <CopilotAppDialog
          repositoryPath="/worktrees/topic"
          message="Could not open."
          onDismissed={() => {
            dismissed = true
          }}
          onOpen={async () => {
            opened = true
          }}
        />
      </DialogStackContext.Provider>
    )
    await waitFor(() => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Cancel', hidden: true })
      )
      assert.strictEqual(dismissed, true)
    })
    assert.strictEqual(opened, false)
    view.unmount()
  })
})
