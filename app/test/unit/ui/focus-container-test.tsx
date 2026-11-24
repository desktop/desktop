import assert from 'node:assert'
import { it } from 'node:test'
import * as React from 'react'
import { FocusContainer } from '../../../src/ui/lib/focus-container'
import { fireEvent, render, screen } from '../../helpers/ui/render'

it('cancels deferred focus notifications before children unmount', t => {
  const queued = t.mock.method(globalThis, 'requestAnimationFrame', () => 42)
  const canceled = t.mock.method(globalThis, 'cancelAnimationFrame', () => {})
  let notifications = 0
  const view = render(
    <FocusContainer onFocusWithinChanged={() => notifications++}>
      <button>Focus me</button>
    </FocusContainer>
  )

  fireEvent.focusIn(screen.getByRole('button', { name: 'Focus me' }))
  assert.strictEqual(queued.mock.callCount(), 1)
  view.unmount()
  assert.deepStrictEqual(
    canceled.mock.calls.map(call => call.arguments),
    [[42]]
  )
  assert.strictEqual(notifications, 0)
})
