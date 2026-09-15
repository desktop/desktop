import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as React from 'react'

import { AriaLiveContainer } from '../../../src/ui/accessibility/aria-live-container'
import {
  advanceTimersBy,
  enableTestTimers,
  resetTestTimers,
} from '../../helpers/ui/timers'
import { render } from '../../helpers/ui/render'

describe('AriaLiveContainer', () => {
  beforeEach(() => {
    enableTestTimers(['Date', 'setTimeout'])
  })

  afterEach(() => {
    resetTestTimers()
  })

  it('renders a polite live region with the provided id and message', () => {
    const view = render(
      <AriaLiveContainer id="branch-status" message="3 branches found" />
    )

    const container = view.container.querySelector('#branch-status.sr-only')

    assert.notEqual(container, null)
    assert.equal(container?.getAttribute('aria-live'), 'polite')
    assert.equal(container?.getAttribute('aria-atomic'), 'true')
    assert.equal(container?.textContent, '3 branches found')

    view.rerender(<AriaLiveContainer id="branch-status" message={null} />)

    assert.equal(container?.textContent, '')
  })

  it('rebuilds the message after tracked user input changes', () => {
    const view = render(
      <AriaLiveContainer message="1 result" trackedUserInput="m" />
    )

    const container = view.container.querySelector('.sr-only')

    // Initial render toggles suffix from '' → '\u00A0\u00A0'
    assert.equal(container?.textContent, '1 result\u00A0\u00A0')

    view.rerender(
      <AriaLiveContainer message="1 result" trackedUserInput="ma" />
    )

    // Debounce hasn't fired yet, so the message is unchanged
    assert.equal(container?.textContent, '1 result\u00A0\u00A0')

    advanceTimersBy(1001)

    // After debounce, suffix toggles to '\u00A0'
    assert.equal(container?.textContent, '1 result\u00A0')
  })
})
