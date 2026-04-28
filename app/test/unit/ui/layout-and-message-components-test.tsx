import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import {
  CommitWarning,
  CommitWarningIcon,
} from '../../../src/ui/changes/commit-warning'
import { KeyboardShortcut } from '../../../src/ui/keyboard-shortcut/keyboard-shortcut'
import { Errors } from '../../../src/ui/lib/errors'
import { Row } from '../../../src/ui/lib/row'
import { render, screen } from '../../helpers/ui/render'

describe('layout and message components', () => {
  it('renders row and errors wrappers with expected semantics', () => {
    const view = render(
      <>
        <Row id="branch-row" className="spaced-row">
          <span>Row contents</span>
        </Row>
        <Errors className="inline-errors">Fetch failed.</Errors>
      </>
    )

    const row = view.container.querySelector(
      '#branch-row.row-component.spaced-row'
    )
    const error = screen.getByRole('alert')

    assert.notEqual(row, null)
    assert.equal(row?.textContent, 'Row contents')
    assert.ok(error.classList.contains('errors-component'))
    assert.ok(error.classList.contains('inline-errors'))
    assert.equal(error.textContent, 'Fetch failed.')
  })

  it('renders platform-specific keyboard shortcuts', () => {
    const view = render(
      <KeyboardShortcut
        darwinKeys={['⌘', '⇧', 'N']}
        keys={['Ctrl', 'Shift', 'N']}
      />
    )

    const keys = Array.from(view.container.querySelectorAll('kbd')).map(
      key => key.textContent
    )

    assert.deepEqual(
      keys,
      __DARWIN__ ? ['⌘', '⇧', 'N'] : ['Ctrl', 'Shift', 'N']
    )
    assert.equal(
      view.container.textContent,
      __DARWIN__ ? '⌘⇧N' : 'Ctrl+Shift+N'
    )
  })

  it('renders warning variants with the expected icon styling and suppresses context menus', () => {
    const view = render(
      <>
        <CommitWarning icon={CommitWarningIcon.Warning}>
          Watch out.
        </CommitWarning>
        <CommitWarning icon={CommitWarningIcon.Information}>FYI.</CommitWarning>
        <CommitWarning icon={CommitWarningIcon.Error}>Blocked.</CommitWarning>
      </>
    )

    const warnings = Array.from(
      view.container.querySelectorAll('.commit-warning-component')
    )

    assert.equal(warnings.length, 3)
    assert.notEqual(
      warnings[0].querySelector('.warning-icon-container .warning-icon'),
      null
    )
    assert.notEqual(
      warnings[1].querySelector('.warning-icon-container .information-icon'),
      null
    )
    assert.notEqual(
      warnings[2].querySelector('.warning-icon-container .error-icon'),
      null
    )

    const event = new window.MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
    })

    const dispatchResult = warnings[0].dispatchEvent(event)

    assert.equal(dispatchResult, false)
    assert.equal(event.defaultPrevented, true)
    assert.ok(screen.getByText('Watch out.'))
    assert.ok(screen.getByText('FYI.'))
    assert.ok(screen.getByText('Blocked.'))
  })
})
