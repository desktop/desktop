import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'
import { Popover, PopoverAnchorPosition } from '../../../src/ui/lib/popover'
import { render, waitFor } from '../../helpers/ui/render'

describe('Popover', () => {
  it('limits its content to a valid available height', async () => {
    const anchor = document.createElement('button')
    document.body.appendChild(anchor)
    try {
      const view = render(
        <Popover
          anchor={anchor}
          anchorPosition={PopoverAnchorPosition.Bottom}
          maxHeight={500}
          trapFocus={false}
        >
          content
        </Popover>
      )
      const content = view.container.querySelector('.popover-content')
      assert.ok(content instanceof HTMLElement)
      const height = await waitFor(() => {
        const value = content.style.getPropertyValue('--available-height')
        assert.notStrictEqual(value, '')
        return value
      })
      assert.match(height, /^-?\d+(\.\d+)?px$/)
    } finally {
      anchor.remove()
    }
  })
})
