import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { DialogContent } from '../../../src/ui/dialog/content'
import { DialogFooter } from '../../../src/ui/dialog/footer'
import { OkCancelButtonGroup } from '../../../src/ui/dialog/ok-cancel-button-group'
import { fireEvent, render, screen } from '../../helpers/ui/render'

describe('dialog action wrappers', () => {
  it('renders dialog content classes, children, and ref callbacks', () => {
    const refs = new Array<HTMLDivElement | null>()

    function onRef(element: HTMLDivElement | null) {
      refs.push(element)
    }

    const view = render(
      <DialogContent className="wide-content" onRef={onRef}>
        <p>Dialog body</p>
      </DialogContent>
    )

    const content = view.container.querySelector(
      '.dialog-content.wide-content'
    ) as HTMLDivElement | null

    assert.notEqual(content, null)
    assert.equal(content?.textContent, 'Dialog body')
    assert.equal(refs[0], content)

    view.unmount()

    assert.equal(refs[1], null)
  })

  it('renders a dialog footer wrapper around its children', () => {
    const view = render(
      <DialogFooter>
        <span>Footer actions</span>
      </DialogFooter>
    )

    const footer = view.container.querySelector('.dialog-footer')

    assert.notEqual(footer, null)
    assert.equal(footer?.textContent, 'Footer actions')
  })

  it('renders ok-cancel buttons in platform order with non-destructive defaults', () => {
    render(
      <OkCancelButtonGroup
        className="custom-buttons"
        okButtonText="Apply"
        cancelButtonText="Dismiss"
        okButtonAriaDescribedBy="apply-help"
      >
        <span>Extra action</span>
      </OkCancelButtonGroup>
    )

    const buttonGroup = document.querySelector('.button-group.custom-buttons')
    const buttons = screen.getAllByRole('button')
    const names = buttons.map(button => button.textContent)

    assert.notEqual(buttonGroup, null)
    assert.deepEqual(
      names,
      __DARWIN__ ? ['Dismiss', 'Apply'] : ['Apply', 'Dismiss']
    )
    assert.equal(
      (screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement).type,
      'submit'
    )
    assert.equal(
      (screen.getByRole('button', { name: 'Dismiss' }) as HTMLButtonElement)
        .type,
      'reset'
    )
    assert.equal(
      screen
        .getByRole('button', { name: 'Apply' })
        .getAttribute('aria-describedby'),
      'apply-help'
    )
    assert.ok(screen.getByText('Extra action'))
  })

  it('dispatches submit and reset events for destructive button groups', () => {
    const submitted = new Array<string>()
    const reset = new Array<string>()
    const okClicks = new Array<string>()
    const cancelClicks = new Array<string>()

    function onOkButtonClick() {
      okClicks.push('ok')
    }

    function onCancelButtonClick() {
      cancelClicks.push('cancel')
    }

    const view = render(
      <form>
        <OkCancelButtonGroup
          destructive={true}
          okButtonText="Delete"
          cancelButtonText="Keep"
          onOkButtonClick={onOkButtonClick}
          onCancelButtonClick={onCancelButtonClick}
        />
      </form>
    )

    const form = view.container.querySelector('form') as HTMLFormElement
    form.addEventListener('submit', event => {
      event.preventDefault()
      submitted.push('submit')
    })
    form.addEventListener('reset', () => {
      reset.push('reset')
    })

    const deleteButton = screen.getByRole('button', { name: 'Delete' })
    const keepButton = screen.getByRole('button', { name: 'Keep' })
    const group = view.container.querySelector('.button-group.destructive')

    assert.notEqual(group, null)
    assert.equal((deleteButton as HTMLButtonElement).type, 'button')
    assert.equal((keepButton as HTMLButtonElement).type, 'submit')

    fireEvent.click(deleteButton)
    fireEvent.click(keepButton)

    assert.deepEqual(okClicks, ['ok'])
    assert.deepEqual(cancelClicks, ['cancel'])
    assert.deepEqual(submitted, ['submit'])
    assert.deepEqual(reset, ['reset'])
  })
})
