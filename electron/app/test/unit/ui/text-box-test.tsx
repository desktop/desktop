import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import * as octicons from '../../../src/ui/octicons/octicons.generated'
import { TextBox } from '../../../src/ui/lib/text-box'
import { fireEvent, render, screen } from '../../helpers/ui/render'

describe('TextBox', () => {
  it('renders textbox labels, prefixed icons, and forwards focus or blur, key, change, and enter callbacks', () => {
    const changedValues: Array<string> = []
    const keyEvents: Array<string> = []
    const enterValues: Array<string> = []
    const blurValues: Array<string> = []
    let focusCount = 0

    function onValueChanged(value: string) {
      changedValues.push(value)
    }

    function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
      keyEvents.push(event.key)
    }

    function onEnterPressed(value: string) {
      enterValues.push(value)
    }

    function onFocus() {
      focusCount++
    }

    function onBlur(value: string) {
      blurValues.push(value)
    }

    const view = render(
      <TextBox
        label="Branch name"
        value="main"
        ariaDescribedBy="branch-help"
        prefixedIcon={octicons.search}
        onValueChanged={onValueChanged}
        onKeyDown={onKeyDown}
        onEnterPressed={onEnterPressed}
        onFocus={onFocus}
        onBlur={onBlur}
      />
    )

    const input = screen.getByRole('textbox', {
      name: 'Branch name',
    }) as HTMLInputElement

    assert.equal(input.value, 'main')
    assert.equal(input.getAttribute('aria-describedby'), 'branch-help')
    assert.notEqual(
      view.container.querySelector('.prefixed-icon.octicon'),
      null
    )
    assert.ok(
      view.container
        .querySelector('.text-box-component')
        ?.classList.contains('display-prefixed-icon')
    )

    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'release' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.blur(input, { target: { value: 'release' } })

    assert.equal(focusCount, 1)
    assert.deepEqual(changedValues, ['release'])
    assert.deepEqual(keyEvents, ['Enter'])
    assert.deepEqual(enterValues, ['release'])
    assert.deepEqual(blurValues, ['release'])
  })

  it('clears search text through the clear button and announces that the input was cleared', () => {
    const changedValues: Array<string> = []
    let clearedCount = 0

    function onValueChanged(value: string) {
      changedValues.push(value)
    }

    function onSearchCleared() {
      clearedCount++
    }

    const view = render(
      <TextBox
        label="Filter branches"
        type="search"
        value="topic"
        displayClearButton={true}
        onValueChanged={onValueChanged}
        onSearchCleared={onSearchCleared}
      />
    )

    const input = screen.getByRole('searchbox', {
      name: 'Filter branches',
    }) as HTMLInputElement
    const clearButton = screen.getByRole('button', { name: 'Clear' })

    fireEvent.click(clearButton)

    assert.equal(input.value, '')
    assert.equal(document.activeElement, input)
    assert.deepEqual(changedValues, [''])
    assert.equal(clearedCount, 1)
    assert.ok(view.container.textContent?.includes('Input cleared'))
  })

  it('clears or blurs search inputs when escape is pressed', () => {
    const changedValues: Array<string> = []
    const blurValues: Array<string> = []

    function onValueChanged(value: string) {
      changedValues.push(value)
    }

    function onBlur(value: string) {
      blurValues.push(value)
    }

    const view = render(
      <TextBox
        label="Search branches"
        type="search"
        value="feature"
        onValueChanged={onValueChanged}
        onBlur={onBlur}
      />
    )

    const input = screen.getByRole('searchbox', {
      name: 'Search branches',
    }) as HTMLInputElement

    fireEvent.keyDown(input, { key: 'Escape' })

    assert.equal(input.value, '')
    assert.deepEqual(changedValues, [''])

    view.rerender(
      <TextBox
        label="Search branches"
        type="search"
        value=""
        onValueChanged={onValueChanged}
        onBlur={onBlur}
      />
    )

    input.focus()
    assert.equal(document.activeElement, input)

    fireEvent.keyDown(input, { key: 'Escape' })

    assert.equal(document.activeElement, document.body)
    assert.deepEqual(blurValues, ['', ''])
  })
})
