import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import {
  InputDescription,
  InputDescriptionType,
} from '../../../src/ui/lib/input-description/input-description'
import { TextArea } from '../../../src/ui/lib/text-area'
import { fireEvent, render, screen } from '../../helpers/ui/render'

describe('input description and textarea surfaces', () => {
  it('renders caption, warning, and error variants with the expected semantics', () => {
    const view = render(
      <>
        <InputDescription
          id="caption-id"
          inputDescriptionType={InputDescriptionType.Caption}
        >
          Optional description.
        </InputDescription>
        <InputDescription
          id="warning-id"
          inputDescriptionType={InputDescriptionType.Warning}
        >
          This may be visible to your team.
        </InputDescription>
        <InputDescription
          id="error-id"
          inputDescriptionType={InputDescriptionType.Error}
        >
          A value is required.
        </InputDescription>
      </>
    )

    const caption = view.container.querySelector(
      '#caption-id.input-description-caption'
    )
    const warning = view.container.querySelector(
      '#warning-id.input-description-warning'
    )
    const error = screen.getByRole('alert')

    assert.notEqual(caption, null)
    assert.equal(caption?.querySelector('svg.octicon'), null)
    assert.notEqual(warning?.querySelector('svg.octicon'), null)
    assert.ok(error.classList.contains('input-description-error'))
    assert.ok(view.container.textContent?.includes('Optional description.'))
    assert.ok(
      view.container.textContent?.includes('This may be visible to your team.')
    )
  })

  it('renders an aria-live helper for tracked warning and error messages', () => {
    const view = render(
      <>
        <InputDescription
          id="tracked-warning"
          inputDescriptionType={InputDescriptionType.Warning}
          trackedUserInput="feature"
          ariaLiveMessage="This branch name already exists on the remote."
        >
          Remote branch name collision.
        </InputDescription>
        <InputDescription
          id="tracked-error"
          inputDescriptionType={InputDescriptionType.Error}
          trackedUserInput={true}
          ariaLiveMessage="Branch names cannot end with a slash."
        >
          Invalid branch name.
        </InputDescription>
      </>
    )

    const liveRegions = Array.from(view.container.querySelectorAll('.sr-only'))
    const warnings = Array.from(
      view.container.querySelectorAll('.input-description-warning')
    )
    const errors = Array.from(
      view.container.querySelectorAll('.input-description-error')
    )

    assert.equal(liveRegions.length, 2)
    assert.equal(warnings.length, 1)
    assert.equal(errors.length, 1)
    assert.ok(
      liveRegions[0].textContent?.startsWith(
        'This branch name already exists on the remote.'
      )
    )
    assert.ok(
      liveRegions[1].textContent?.startsWith(
        'Branch names cannot end with a slash.'
      )
    )
  })

  it('renders textareas with labels, rows, refs, and value change callbacks', () => {
    const values: Array<string> = []
    let ref: HTMLTextAreaElement | null = null

    function onValueChanged(value: string) {
      values.push(value)
    }

    function onTextAreaRef(instance: HTMLTextAreaElement | null) {
      ref = instance
    }

    render(
      <TextArea
        label="Commit description"
        rows={5}
        value="Initial body"
        ariaDescribedBy="commit-help"
        onValueChanged={onValueChanged}
        onTextAreaRef={onTextAreaRef}
      />
    )

    const textarea = screen.getByRole('textbox', {
      name: 'Commit description',
    }) as HTMLTextAreaElement

    assert.equal(ref, textarea)
    assert.equal(textarea.getAttribute('rows'), '5')
    assert.equal(textarea.getAttribute('aria-describedby'), 'commit-help')

    fireEvent.change(textarea, { target: { value: 'Updated body' } })

    assert.deepEqual(values, ['Updated body'])
  })

  it('does not call onValueChanged when textarea onChange prevents default', () => {
    const values: Array<string> = []

    function onChange(event: React.FormEvent<HTMLTextAreaElement>) {
      event.preventDefault()
    }

    function onValueChanged(value: string) {
      values.push(value)
    }

    render(
      <TextArea
        label="Message"
        onChange={onChange}
        onValueChanged={onValueChanged}
      />
    )

    const textarea = screen.getByRole('textbox', { name: 'Message' })

    fireEvent.change(textarea, { target: { value: 'Blocked update' } })

    assert.deepEqual(values, [])
  })
})
