import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { DefaultDialogFooter } from '../../../src/ui/dialog/default-dialog-footer'
import { DialogHeader } from '../../../src/ui/dialog/header'
import { CallToAction } from '../../../src/ui/lib/call-to-action'
import { ToggleButton } from '../../../src/ui/lib/toggle-button'
import { fireEvent, render, screen } from '../../helpers/ui/render'

describe('dialog composition and toggle components', () => {
  it('renders call-to-action content and invokes the action callback', () => {
    let actionCount = 0

    function onAction() {
      actionCount++
    }

    const view = render(
      <CallToAction
        actionTitle="Retry"
        buttonClassName="retry-now"
        onAction={onAction}
      >
        Unable to reach the remote.
      </CallToAction>
    )

    const row = view.container.querySelector('.row-component.call-to-action')
    const button = screen.getByRole('button', { name: 'Retry' })

    assert.notEqual(row, null)
    assert.ok(screen.getByText('Unable to reach the remote.'))
    assert.ok(button.classList.contains('action-button'))
    assert.ok(button.classList.contains('button-component-primary'))
    assert.ok(button.classList.contains('retry-now'))

    fireEvent.click(button)

    assert.equal(actionCount, 1)
  })

  it('renders dialog header title, accessory, spinner, and close button behavior', () => {
    let closed = 0

    function onCloseButtonClick() {
      closed++
    }

    function renderAccessory() {
      return <span data-testid="header-accessory">Accessory</span>
    }

    const view = render(
      <DialogHeader
        title="Rename Branch"
        titleId="rename-branch-title"
        loading={true}
        onCloseButtonClick={onCloseButtonClick}
        renderAccessory={renderAccessory}
      />
    )

    const title = view.container.querySelector('h1#rename-branch-title')
    const spinner = view.container.querySelector('svg.octicon.icon.spin')
    const closeButton = screen.getByRole('button', { name: 'Close' })

    assert.equal(title?.textContent, 'Rename Branch')
    assert.notEqual(spinner, null)
    assert.ok(screen.getByTestId('header-accessory'))

    fireEvent.click(closeButton)

    assert.equal(closed, 1)

    view.rerender(
      <DialogHeader title="Rename Branch" showCloseButton={false} />
    )

    assert.equal(screen.queryByRole('button', { name: 'Close' }), null)
  })

  it('renders a default dialog footer with a single submit button', () => {
    const view = render(
      <DefaultDialogFooter buttonText="Apply" disabled={true} />
    )

    const footer = view.container.querySelector('.dialog-footer')
    const buttonGroup = view.container.querySelector('.button-group')
    const button = screen.getByRole('button', { name: 'Apply' })

    assert.notEqual(footer, null)
    assert.notEqual(buttonGroup, null)
    assert.equal(button.getAttribute('type'), 'submit')
    assert.equal(button.getAttribute('aria-disabled'), 'true')
    assert.equal(screen.queryByRole('button', { name: 'Cancel' }), null)
  })

  it('toggles unchecked and checked state for uncontrolled toggle buttons', () => {
    const toggledStates = new Array<boolean>()

    function onToggle(checked: boolean) {
      toggledStates.push(checked)
    }

    render(
      <>
        <ToggleButton onClick={onToggle}>Toggle whitespace</ToggleButton>
        <ToggleButton checked={true}>Keep checked</ToggleButton>
      </>
    )

    const toggle = screen.getByRole('button', { name: 'Toggle whitespace' })
    const controlled = screen.getByRole('button', { name: 'Keep checked' })

    assert.ok(toggle.classList.contains('unchecked'))
    assert.ok(controlled.classList.contains('checked'))

    fireEvent.click(toggle)
    assert.ok(toggle.classList.contains('checked'))

    fireEvent.click(toggle)
    assert.ok(toggle.classList.contains('unchecked'))
    assert.deepEqual(toggledStates, [true, false])
  })
})
