import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import type { IAvatarUser } from '../../../src/models/avatar'
import { DialogContent } from '../../../src/ui/dialog/content'
import { AccessText } from '../../../src/ui/lib/access-text'
import { CommitAttribution } from '../../../src/ui/lib/commit-attribution'
import { Form } from '../../../src/ui/lib/form'
import { HighlightText } from '../../../src/ui/lib/highlight-text'
import { UiView } from '../../../src/ui/ui-view'
import { render, screen } from '../../helpers/ui/render'

function createAvatarUser(name: string): IAvatarUser {
  return {
    name,
    email: `${name.toLowerCase()}@example.com`,
    avatarURL: undefined,
    endpoint: null,
  }
}

describe('structural and text components', () => {
  it('renders form, dialog content, and ui view wrappers and prevents default submit behavior', () => {
    let submitted = 0
    let refElement: HTMLDivElement | null = null

    function onSubmit() {
      submitted++
    }

    function onRef(element: HTMLDivElement | null) {
      refElement = element
    }

    const view = render(
      <UiView id="history-view" className="visible">
        <Form className="branch-form" onSubmit={onSubmit}>
          <DialogContent className="body" onRef={onRef}>
            <button type="submit">Save</button>
            <span>Dialog body copy</span>
          </DialogContent>
        </Form>
      </UiView>
    )

    const uiView = view.container.querySelector('#history-view.ui-view.visible')
    const form = view.container.querySelector('form.form-component.branch-form')
    const content = view.container.querySelector(
      '.dialog-content.body'
    ) as HTMLDivElement | null

    assert.notEqual(uiView, null)
    assert.notEqual(form, null)
    assert.notEqual(content, null)
    assert.equal(refElement, content)
    assert.ok(screen.getByRole('button', { name: 'Save' }))
    assert.ok(screen.getByText('Dialog body copy'))

    const submitEvent = new window.Event('submit', {
      bubbles: true,
      cancelable: true,
    })

    form?.dispatchEvent(submitEvent)

    assert.equal(submitted, 1)
    assert.equal(submitEvent.defaultPrevented, true)
  })

  it('renders commit attribution for one, two, and many authors', () => {
    const mona = createAvatarUser('Mona')
    const hubot = createAvatarUser('Hubot')
    const desktop = createAvatarUser('Desktop')

    const view = render(
      <>
        <CommitAttribution avatarUsers={[mona]} />
        <CommitAttribution avatarUsers={[mona, hubot]} />
        <CommitAttribution avatarUsers={[mona, hubot, desktop]} />
      </>
    )

    const attributions = Array.from(
      view.container.querySelectorAll('.commit-attribution-component')
    )

    assert.deepEqual(
      attributions.map(attribution => attribution.textContent),
      ['Mona', 'Mona, Hubot', '3 people']
    )

    const authorNames = Array.from(
      view.container.querySelectorAll('.author')
    ).map(author => author.textContent)

    assert.deepEqual(authorNames, ['Mona', 'Mona', 'Hubot'])
  })

  it('renders access text with a screen-reader fallback and optional highlighting', () => {
    const view = render(
      <>
        <AccessText text="E&xit" highlight={true} />
        <AccessText text="Plain text" />
      </>
    )

    const highlightedKey = view.container.querySelector('.access-key.highlight')
    const srOnly = view.container.querySelector('.sr-only')

    assert.equal(highlightedKey?.textContent, 'x')
    assert.equal(srOnly?.textContent, 'Exit')
    assert.ok(screen.getByText('Plain text'))
  })

  it('renders contiguous highlight runs as mark elements', () => {
    const view = render(<HighlightText text="branch" highlight={[1, 2, 3]} />)

    const mark = view.container.querySelector('mark')
    const spans = Array.from(view.container.querySelectorAll('span')).map(
      element => element.textContent
    )

    assert.equal(mark?.textContent, 'ran')
    assert.ok(spans.includes('b'))
    assert.ok(spans.includes('ch'))
  })
})
