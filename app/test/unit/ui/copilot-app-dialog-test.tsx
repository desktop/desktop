import assert from 'node:assert'
import { afterEach, describe, it, mock } from 'node:test'
import * as React from 'react'
import { fireEvent, render, screen } from '../../helpers/ui/render'

const openedUrls: string[] = []
mock.module('../../../src/lib/app-shell', {
  namedExports: {
    shell: {
      openExternal: (url: string) => {
        openedUrls.push(url)
      },
    },
  },
})
mock.module('../../../src/ui/main-process-proxy', {
  namedExports: {
    sendDialogDidOpen: () => {},
  },
})

async function getDialog() {
  return (await import('../../../src/ui/copilot-app/copilot-app-dialog'))
    .CopilotAppDialog
}

afterEach(() => {
  openedUrls.length = 0
})

describe('Copilot app dialog', () => {
  it('offers download and preferences actions', async () => {
    const CopilotAppDialog = await getDialog()
    render(
      <CopilotAppDialog
        message="Couldn't find the GitHub Copilot App."
        onDismissed={() => {}}
        showPreferencesDialog={() => {}}
      />
    )

    assert.ok(screen.getByText("Couldn't find the GitHub Copilot App."))
    assert.ok(
      screen.getByRole('button', {
        name: 'Download GitHub Copilot',
        hidden: true,
      })
    )
    assert.ok(
      screen.getByRole('button', {
        name: __DARWIN__ ? 'Open Preferences' : 'Open options',
        hidden: true,
      })
    )
    assert.strictEqual(screen.queryByRole('textbox', { hidden: true }), null)
  })

  it('opens the GitHub Copilot marketing page', async () => {
    const CopilotAppDialog = await getDialog()
    let dismissed = false
    render(
      <CopilotAppDialog
        message="Couldn't find the GitHub Copilot App."
        onDismissed={() => {
          dismissed = true
        }}
        showPreferencesDialog={() => {}}
      />
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Download GitHub Copilot',
        hidden: true,
      })
    )

    assert.deepStrictEqual(openedUrls, ['https://gh.io/app'])
    assert.strictEqual(dismissed, true)
  })

  it('dismisses before opening integrations preferences', async () => {
    const CopilotAppDialog = await getDialog()
    const calls: string[] = []
    render(
      <CopilotAppDialog
        message="Couldn't find the GitHub Copilot App."
        onDismissed={() => {
          calls.push('dismissed')
        }}
        showPreferencesDialog={() => {
          calls.push('preferences')
        }}
      />
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: __DARWIN__ ? 'Open Preferences' : 'Open options',
        hidden: true,
      })
    )

    assert.deepStrictEqual(calls, ['dismissed', 'preferences'])
  })
})
