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
  return (
    await import('../../../src/ui/copilot-app/copilot-app-not-found-dialog')
  ).CopilotAppNotFoundDialog
}

afterEach(() => {
  openedUrls.length = 0
})

describe('Copilot app not found dialog', () => {
  it('offers inline download and preferences actions', async () => {
    const CopilotAppNotFoundDialog = await getDialog()
    render(
      <CopilotAppNotFoundDialog
        onDismissed={() => {}}
        showPreferencesDialog={() => {}}
      />
    )

    assert.ok(
      screen.getByText(/Couldn't find the GitHub Copilot App on your machine/)
    )
    assert.ok(
      screen.getByRole('link', {
        name: 'downloading GitHub Copilot',
        hidden: true,
      })
    )
    assert.ok(
      screen.getByRole('button', {
        name: 'Preferences',
        hidden: true,
      })
    )
    assert.strictEqual(
      screen.getAllByRole('button', {
        name: 'Close',
        hidden: true,
      }).length,
      2
    )
    assert.strictEqual(screen.queryByRole('textbox', { hidden: true }), null)
  })

  it('opens the GitHub Copilot marketing page', async () => {
    const CopilotAppNotFoundDialog = await getDialog()
    let dismissed = false
    render(
      <CopilotAppNotFoundDialog
        onDismissed={() => {
          dismissed = true
        }}
        showPreferencesDialog={() => {}}
      />
    )

    fireEvent.click(
      screen.getByRole('link', {
        name: 'downloading GitHub Copilot',
        hidden: true,
      })
    )

    assert.deepStrictEqual(openedUrls, ['https://gh.io/app'])
    assert.strictEqual(dismissed, false)
  })

  it('dismisses before opening integrations preferences', async () => {
    const CopilotAppNotFoundDialog = await getDialog()
    const calls: string[] = []
    render(
      <CopilotAppNotFoundDialog
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
        name: 'Preferences',
        hidden: true,
      })
    )

    assert.deepStrictEqual(calls, ['dismissed', 'preferences'])
  })
})
