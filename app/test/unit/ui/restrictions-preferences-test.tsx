import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { Restrictions } from '../../../src/ui/preferences/restrictions'
import { fireEvent, render, screen } from '../../helpers/ui/render'

describe('Restrictions preferences', () => {
  it('shows the repository removal restriction and reports changes', () => {
    let preventRepositoryRemoval = false

    render(
      <Restrictions
        preventRepositoryRemoval={preventRepositoryRemoval}
        onPreventRepositoryRemovalChanged={value => {
          preventRepositoryRemoval = value
        }}
      />
    )

    const checkbox = screen.getByRole('checkbox', {
      name: 'Prevent repository removal',
    }) as HTMLInputElement

    assert.equal(checkbox.checked, false)
    assert.equal(
      checkbox.getAttribute('aria-describedby'),
      'prevent-repository-removal-description'
    )

    fireEvent.click(checkbox)

    assert.equal(preventRepositoryRemoval, true)
  })
})
