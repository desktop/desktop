import assert from 'node:assert'
import { afterEach, describe, it } from 'node:test'
import * as React from 'react'

import { render, screen } from '../../helpers/ui/render'

let restoreIpcSend: (() => void) | null = null

describe('GitHubDesktopRepositoryImportResultsDialog', () => {
  afterEach(() => {
    restoreIpcSend?.()
    restoreIpcSend = null
  })

  it('renders import outcomes and the summary counts', async () => {
    const electron = await import('electron')
    const previousSend = electron.ipcRenderer.send
    electron.ipcRenderer.send = () => {}
    restoreIpcSend = () => {
      electron.ipcRenderer.send = previousSend
    }

    const { GitHubDesktopRepositoryImportResultsDialog } = await import(
      '../../../src/ui/github-desktop-repository-import-results-dialog'
    )

    render(
      <GitHubDesktopRepositoryImportResultsDialog
        results={[
          {
            path: 'C:\\Repos\\alpha',
            outcome: 'imported',
            detail: 'Imported successfully.',
          },
          {
            path: 'C:\\Repos\\beta',
            outcome: 'skipped',
            detail: 'Already added in this app.',
          },
          {
            path: 'C:\\Repos\\gamma',
            outcome: 'failed',
            detail: 'The path no longer exists or is not a Git repository.',
          },
        ]}
        onDismissed={() => undefined}
      />
    )

    assert.ok(screen.getByText('Imported 1 repository from GitHub Desktop.'))
    assert.ok(screen.getByText('1 skipped, 1 failed.'))
    assert.ok(screen.getByText('Imported'))
    assert.ok(screen.getByText('Skipped'))
    assert.ok(screen.getByText('Failed'))
    assert.ok(screen.getByText('Imported successfully.'))
    assert.ok(screen.getByText('Already added in this app.'))
    assert.ok(
      screen.getByText('The path no longer exists or is not a Git repository.')
    )
  })
})
