import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { PasswordTextBox } from '../../../src/ui/lib/password-text-box'
import { fireEvent, render, screen } from '../../helpers/ui/render'

describe('PasswordTextBox', () => {
  it('toggles password visibility, keeps focus on the input, and forwards value changes', () => {
    const changedValues: Array<string> = []

    function onValueChanged(value: string) {
      changedValues.push(value)
    }

    render(
      <PasswordTextBox
        label="Password"
        value="hunter2"
        onValueChanged={onValueChanged}
      />
    )

    const input = screen.getByLabelText('Password') as HTMLInputElement
    const toggle = screen.getByRole('button', {
      name: 'Toggle password visibility',
    })

    assert.equal(input.type, 'password')
    assert.equal(toggle.getAttribute('aria-pressed'), 'false')

    fireEvent.change(input, { target: { value: 'hunter22' } })

    assert.deepEqual(changedValues, ['hunter22'])

    input.focus()
    assert.equal(document.activeElement, input)

    fireEvent.click(toggle)

    assert.equal(input.type, 'text')
    assert.equal(toggle.getAttribute('aria-pressed'), 'true')
    assert.equal(document.activeElement, input)

    fireEvent.click(toggle)

    assert.equal(input.type, 'password')
    assert.equal(toggle.getAttribute('aria-pressed'), 'false')
    assert.equal(document.activeElement, input)
  })
})
