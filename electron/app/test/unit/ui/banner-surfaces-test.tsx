import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as React from 'react'

import { BranchAlreadyUpToDate } from '../../../src/ui/banners/branch-already-up-to-date-banner'
import { Banner } from '../../../src/ui/banners/banner'
import { CherryPickUndone } from '../../../src/ui/banners/cherry-pick-undone'
import { SuccessBanner } from '../../../src/ui/banners/success-banner'
import {
  advanceTimersBy,
  enableTestTimers,
  resetTestTimers,
} from '../../helpers/ui/timers'
import { fireEvent, render, screen } from '../../helpers/ui/render'

describe('banner surfaces', () => {
  beforeEach(() => {
    enableTestTimers(['setTimeout'])
  })

  afterEach(() => {
    resetTestTimers()
  })

  it('focuses the first suitable banner element and auto-dismisses on focus out', () => {
    let dismissed = 0

    function onDismissed() {
      dismissed++
    }

    const view = render(
      <Banner id="test-banner" timeout={500} onDismissed={onDismissed}>
        <a href="https://example.com/help">Learn more</a>
      </Banner>
    )

    const banner = view.container.querySelector('#test-banner.banner')
    const link = screen.getByRole('link', { name: 'Learn more' })
    const dismissButton = screen.getByRole('button', {
      name: 'Dismiss this message',
    })

    assert.notEqual(banner, null)
    assert.ok(dismissButton)

    advanceTimersBy(200)

    assert.equal(document.activeElement, link)

    fireEvent.focusOut(link, { relatedTarget: document.body })

    advanceTimersBy(500)

    assert.equal(dismissed, 1)
  })

  it('renders success banner content and triggers dismiss plus undo from the undo link', () => {
    let dismissed = 0
    let undone = 0

    function onDismissed() {
      dismissed++
    }

    function onUndo() {
      undone++
    }

    render(
      <SuccessBanner timeout={750} onDismissed={onDismissed} onUndo={onUndo}>
        Branch renamed successfully.
      </SuccessBanner>
    )

    const undoButton = screen.getByRole('button', { name: 'Undo' })

    assert.ok(screen.getByText('Branch renamed successfully.'))
    assert.notEqual(document.querySelector('.success-contents'), null)
    assert.notEqual(document.querySelector('.green-circle .check-icon'), null)

    fireEvent.click(undoButton)

    assert.equal(dismissed, 1)
    assert.equal(undone, 1)
  })

  it('renders branch up-to-date banner messages with and without the compared branch', () => {
    function onDismissed() {}

    const view = render(
      <BranchAlreadyUpToDate
        ourBranch="main"
        theirBranch="origin/main"
        onDismissed={onDismissed}
      />
    )

    assert.ok(screen.getByText('main'))
    assert.ok(screen.getByText('origin/main'))
    assert.ok(
      view.container.textContent?.includes('is already up to date with')
    )

    view.rerender(
      <BranchAlreadyUpToDate ourBranch="release" onDismissed={onDismissed} />
    )

    assert.ok(screen.getByText('release'))
    assert.ok(view.container.textContent?.includes('is already up to date'))
  })

  it('renders cherry-pick undone messages with singular and plural commit copy', () => {
    function onDismissed() {}

    const view = render(
      <CherryPickUndone
        countCherryPicked={1}
        targetBranchName="main"
        onDismissed={onDismissed}
      />
    )

    assert.ok(
      view.container.textContent?.includes(
        'Cherry-pick undone. Successfully removed the 1 copied commit from'
      )
    )
    assert.ok(screen.getByText('main'))

    view.rerender(
      <CherryPickUndone
        countCherryPicked={3}
        targetBranchName="release"
        onDismissed={onDismissed}
      />
    )

    assert.ok(
      view.container.textContent?.includes(
        'Cherry-pick undone. Successfully removed the 3 copied commits from'
      )
    )
    assert.ok(screen.getByText('release'))
  })
})
