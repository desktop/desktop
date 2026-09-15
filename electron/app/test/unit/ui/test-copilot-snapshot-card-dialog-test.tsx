import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as React from 'react'
import { render, screen, fireEvent, within } from '../../helpers/ui/render'
import { TestCopilotSnapshotCardDialog } from '../../../src/ui/preferences/test-copilot-snapshot-card-dialog'
import { Account } from '../../../src/models/account'

let restoreIpcSend: (() => void) | null = null

function makeAccount(): Account {
  return new Account(
    'octo',
    'https://enterprise.example.com/api/v3',
    'token',
    [],
    'https://avatars.githubusercontent.com/u/2',
    2,
    'Octo Cat'
  )
}

function renderDialog(accounts: ReadonlyArray<Account> = []) {
  return render(
    <TestCopilotSnapshotCardDialog accounts={accounts} onDismissed={() => {}} />
  )
}

describe('TestCopilotSnapshotCardDialog', () => {
  beforeEach(async () => {
    const electron = await import('electron')
    const previousSend = electron.ipcRenderer.send
    electron.ipcRenderer.send = () => {}
    restoreIpcSend = () => {
      electron.ipcRenderer.send = previousSend
    }
  })

  afterEach(() => {
    restoreIpcSend?.()
    restoreIpcSend = null
  })

  it('renders a configurable snapshot card preview', () => {
    const view = renderDialog()
    const preview = view.container.querySelector(
      '.test-copilot-snapshot-card-preview'
    )
    assert.ok(preview instanceof HTMLElement)

    assert.ok(within(preview).getByText('Mona Lisa'))
    assert.ok(within(preview).getByText('@mona'))
    assert.ok(within(preview).getByText('Chat messages'))
    assert.ok(within(preview).getByText('Premium requests'))
  })

  it('keeps the preview separate from the scrollable controls', () => {
    const view = renderDialog()
    const content = view.container.querySelector('.dialog-content')
    const preview = view.container.querySelector(
      '.test-copilot-snapshot-card-preview'
    )
    const controls = view.container.querySelector(
      '.test-copilot-snapshot-card-controls'
    )

    assert.ok(content instanceof HTMLElement)
    assert.ok(preview instanceof HTMLElement)
    assert.ok(controls instanceof HTMLElement)
    assert.strictEqual(content.children[0], preview)
    assert.strictEqual(content.children[1], controls)
    assert.strictEqual(controls.contains(screen.getByLabelText('Login')), true)
  })

  it('uses the first available account as the fake account default', () => {
    const view = renderDialog([makeAccount()])
    const preview = view.container.querySelector(
      '.test-copilot-snapshot-card-preview'
    )
    assert.ok(preview instanceof HTMLElement)

    assert.ok(within(preview).getByText('@octo (Octo Cat)'))
    assert.ok(within(preview).getByText('https://enterprise.example.com'))
    assert.ok(screen.getByDisplayValue('Octo Cat'))
    assert.ok(
      screen.getByDisplayValue('https://avatars.githubusercontent.com/u/2')
    )
    assert.ok(within(preview).getByText('Chat messages'))
    assert.ok(within(preview).getByText('Premium requests'))
  })

  it('updates the fake account displayed in the preview', () => {
    renderDialog()

    fireEvent.change(screen.getByLabelText('Login'), {
      target: { value: 'octo' },
    })
    fireEvent.change(screen.getByLabelText('Endpoint'), {
      target: { value: 'https://enterprise.example.com/api/v3' },
    })

    assert.ok(screen.getByText('@octo (Mona Lisa)'))
    assert.ok(screen.getByText('https://enterprise.example.com'))
  })

  it('previews token-based billing data', () => {
    const view = renderDialog()
    const preview = view.container.querySelector(
      '.test-copilot-snapshot-card-preview'
    )
    assert.ok(preview instanceof HTMLElement)

    fireEvent.click(screen.getByText('AI credits preset'))

    assert.ok(within(preview).getByText('AI credits'))
    assert.ok(within(preview).getByText('(resets monthly)'))
    assert.strictEqual(within(preview).queryByText('Chat messages'), null)
  })

  it('previews rate limit data', () => {
    const view = renderDialog()
    const preview = view.container.querySelector(
      '.test-copilot-snapshot-card-preview'
    )
    assert.ok(preview instanceof HTMLElement)

    fireEvent.click(screen.getByText('Rate limit preset'))

    assert.ok(within(preview).getByText('Session limits'))
    assert.ok(within(preview).getByText('Weekly limits'))
  })
})
