import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { DialogError } from '../../../src/ui/dialog/error'
import { DialogSuccess } from '../../../src/ui/dialog/success'
import { Caption } from '../../../src/ui/lib/input-description/input-caption'
import { InputError } from '../../../src/ui/lib/input-description/input-error'
import { InputWarning } from '../../../src/ui/lib/input-description/input-warning'
import { render, screen } from '../../helpers/ui/render'

describe('dialog and input descriptions', () => {
  it('renders dialog error and success banners with alert semantics', () => {
    const view = render(
      <>
        <DialogError>Unable to fetch remotes.</DialogError>
        <DialogSuccess>Branch renamed successfully.</DialogSuccess>
      </>
    )

    const alerts = screen.getAllByRole('alert')
    const errorBanner = view.container.querySelector(
      '.dialog-banner.dialog-error'
    )
    const successBanner = view.container.querySelector(
      '.dialog-banner.dialog-success'
    )

    assert.equal(alerts.length, 2)
    assert.notEqual(errorBanner?.querySelector('svg.octicon'), null)
    assert.notEqual(successBanner?.querySelector('svg.octicon'), null)
    assert.ok(screen.getByText('Unable to fetch remotes.'))
    assert.ok(screen.getByText('Branch renamed successfully.'))
  })

  it('renders caption styling without error semantics', () => {
    const view = render(
      <Caption id="branch-caption">Branch names may include slashes.</Caption>
    )

    const description = view.container.querySelector(
      '.input-description-caption'
    )

    assert.notEqual(description, null)
    assert.equal(description?.getAttribute('role'), null)
    assert.equal(description?.querySelector('svg.octicon'), null)
    assert.equal(
      view.container.querySelector('.input-description-content')?.textContent,
      'Branch names may include slashes.'
    )
  })

  it('renders input errors as alerts when they are not tied to tracked input', () => {
    render(
      <InputError id="branch-error">
        A branch with that name already exists.
      </InputError>
    )

    const alert = screen.getByRole('alert')

    assert.ok(alert.classList.contains('input-description-error'))
    assert.notEqual(alert.querySelector('svg.octicon'), null)
    assert.equal(
      alert.querySelector('.input-description-content')?.textContent,
      'A branch with that name already exists.'
    )
  })

  it('renders input warnings with warning styling and aria-live content', () => {
    const view = render(
      <InputWarning
        id="branch-warning"
        trackedUserInput="branch"
        ariaLiveMessage="This branch name already exists on the remote."
      >
        This branch name already exists on the remote.
      </InputWarning>
    )

    const warning = view.container.querySelector('.input-description-warning')
    const ariaLive = view.container.querySelector('.sr-only')

    assert.notEqual(warning, null)
    assert.equal(warning?.getAttribute('role'), null)
    assert.notEqual(warning?.querySelector('svg.octicon'), null)
    assert.equal(
      warning?.querySelector('.input-description-content')?.textContent,
      'This branch name already exists on the remote.'
    )
    assert.equal(ariaLive?.getAttribute('aria-live'), 'polite')
    assert.ok(
      ariaLive?.textContent?.startsWith(
        'This branch name already exists on the remote.'
      )
    )
  })
})
