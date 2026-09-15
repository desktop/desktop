import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as React from 'react'

import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'
import { captureClipboardWrites } from '../../helpers/ui/electron'
import {
  advanceTimersBy,
  enableTestTimers,
  resetTestTimers,
} from '../../helpers/ui/timers'
import { CopyButton } from '../../../src/ui/copy-button'

describe('CopyButton', () => {
  let clipboardCapture: ReturnType<typeof captureClipboardWrites>

  beforeEach(() => {
    enableTestTimers(['setTimeout'])
    clipboardCapture = captureClipboardWrites()
  })

  afterEach(() => {
    clipboardCapture.restore()
    resetTestTimers()
  })

  it('copies content and announces the copied state before resetting', async () => {
    render(
      <CopyButton copyContent="refs/heads/main" ariaLabel="Copy branch name" />
    )

    const button = screen.getByRole('button', { name: 'Copy branch name' })

    fireEvent.click(button)

    assert.deepEqual(clipboardCapture.writes, ['refs/heads/main'])

    advanceTimersBy(1000)

    await waitFor(() => {
      const liveRegion = screen.getByText(/^Copied!/, { selector: 'div' })
      assert.ok(liveRegion.textContent?.startsWith('Copied!'))
    })

    advanceTimersBy(2000)

    await waitFor(() => {
      assert.equal(screen.queryByText(/^Copied!/, { selector: 'div' }), null)
    })
  })
})
