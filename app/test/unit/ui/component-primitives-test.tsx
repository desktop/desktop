import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { FilesChangedBadge } from '../../../src/ui/changes/files-changed-badge'
import { DialogFooter } from '../../../src/ui/dialog/footer'
import { HorizontalRule } from '../../../src/ui/lib/horizontal-rule'
import { Loading } from '../../../src/ui/lib/loading'
import { Ref } from '../../../src/ui/lib/ref'
import { Toolbar } from '../../../src/ui/toolbar/toolbar'
import { render, screen } from '../../helpers/ui/render'

describe('component primitives', () => {
  it('renders the loading spinner octicon', () => {
    const view = render(<Loading />)

    const spinner = view.container.querySelector('svg.octicon.spin')

    assert.notEqual(spinner, null)
    assert.equal(spinner?.getAttribute('aria-hidden'), 'true')
  })

  it('renders a horizontal rule title when provided', () => {
    const view = render(<HorizontalRule title="Recent Activity" />)

    const wrapper = view.container.querySelector('.horizontal-rule')
    const content = view.container.querySelector('.horizontal-rule-content')

    assert.notEqual(wrapper, null)
    assert.equal(content?.textContent, 'Recent Activity')
  })

  it('renders footer, ref, and toolbar children with their wrapper classes', () => {
    const view = render(
      <>
        <DialogFooter>
          <button type="button">Confirm</button>
        </DialogFooter>
        <Ref>refs/heads/main</Ref>
        <Toolbar id="main-toolbar">
          <span>Toolbar contents</span>
        </Toolbar>
      </>
    )

    const footer = view.container.querySelector('.dialog-footer')
    const ref = view.container.querySelector('em.ref-component')
    const toolbar = view.container.querySelector('#main-toolbar.toolbar')

    assert.notEqual(footer, null)
    assert.equal(
      screen.getByRole('button', { name: 'Confirm' }).textContent,
      'Confirm'
    )
    assert.equal(ref?.textContent, 'refs/heads/main')
    assert.equal(toolbar?.textContent?.trim(), 'Toolbar contents')
  })

  it('renders the changed files badge count and caps large values', () => {
    const view = render(
      <>
        <FilesChangedBadge filesChangedCount={12} />
        <FilesChangedBadge filesChangedCount={301} />
      </>
    )

    const badges = Array.from(view.container.querySelectorAll('.counter'))

    assert.deepEqual(
      badges.map(badge => badge.textContent),
      ['12', '300+']
    )
  })
})
