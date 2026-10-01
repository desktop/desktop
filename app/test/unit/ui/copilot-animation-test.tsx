import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as React from 'react'

import { CopilotAnimation } from '../../../src/ui/copilot-animation/copilot-animation'
import { CopilotCommitPanel } from '../../../src/ui/changes/copilot-commit-panel'
import { render, screen } from '../../helpers/ui/render'
import {
  advanceTimersBy,
  enableTestTimers,
  resetTestTimers,
} from '../../helpers/ui/timers'

/**
 * Advance the timers one phase at a time, since timers scheduled while
 * advancing the clock won't fire until the next advance.
 */
function advanceThroughPhases(...durations: ReadonlyArray<number>) {
  for (const duration of durations) {
    advanceTimersBy(duration)
  }
}

function getAnimationState(container: HTMLElement) {
  return container
    .querySelector('.copilot-sprite')
    ?.getAttribute('data-animation-state')
}

describe('CopilotAnimation', () => {
  beforeEach(() => enableTestTimers(['setTimeout', 'Date']))
  afterEach(() => resetTestTimers())

  it('plays a one-shot animation and notifies when it ends', () => {
    let ended = 0
    const view = render(
      <CopilotAnimation
        animation="tickle"
        loop={false}
        onAnimationEnd={() => ended++}
      />
    )

    assert.equal(getAnimationState(view.container), 'idle')

    advanceTimersBy(33)
    assert.equal(getAnimationState(view.container), 'running')
    assert.equal(ended, 0)

    advanceTimersBy(1188)
    assert.equal(getAnimationState(view.container), 'idle')
    assert.equal(ended, 1)

    // One-shot animations don't restart on their own
    advanceTimersBy(5000)
    assert.equal(ended, 1)
  })

  it('finishes the current cycle of a looping animation when it stops looping', () => {
    let ended = 0
    const view = render(
      <CopilotAnimation
        animation="thinking"
        loop={true}
        onAnimationEnd={() => ended++}
      />
    )

    advanceTimersBy(33)
    assert.equal(getAnimationState(view.container), 'starting')
    advanceTimersBy(429)
    assert.equal(getAnimationState(view.container), 'running')

    advanceTimersBy(10_000)
    assert.equal(getAnimationState(view.container), 'running')

    view.rerender(
      <CopilotAnimation
        animation="thinking"
        loop={false}
        onAnimationEnd={() => ended++}
      />
    )

    advanceTimersBy(1390)
    assert.equal(getAnimationState(view.container), 'ending')
    assert.equal(ended, 0)

    advanceTimersBy(429)
    assert.equal(getAnimationState(view.container), 'idle')
    assert.equal(ended, 1)
  })

  it('restarts when the animation changes', () => {
    const view = render(<CopilotAnimation animation="tickle" loop={false} />)

    advanceThroughPhases(33, 1188)
    assert.equal(getAnimationState(view.container), 'idle')

    view.rerender(<CopilotAnimation animation="jump-wiggle" loop={false} />)
    assert.ok(view.container.querySelector('.copilot-sprite-jump-wiggle'))

    advanceTimersBy(33)
    assert.equal(getAnimationState(view.container), 'running')
  })

  it('is hidden from assistive technologies', () => {
    const view = render(<CopilotAnimation animation="idle" loop={true} />)
    const holder = view.container.querySelector('.copilot-animation')
    assert.equal(holder?.getAttribute('aria-hidden'), 'true')
  })
})

describe('CopilotCommitPanel', () => {
  beforeEach(() => enableTestTimers(['setTimeout', 'Date']))
  afterEach(() => resetTestTimers())

  it('asks the user to select changes when none are selected', () => {
    render(<CopilotCommitPanel filesSelectedCount={0} isWorking={false} />)

    assert.ok(screen.getByText(/Select the changes you want to commit/))
  })

  it('describes what Copilot will do with the selected files', () => {
    const view = render(
      <CopilotCommitPanel filesSelectedCount={3} isWorking={false} />
    )

    assert.ok(screen.getByText(/split the 3 selected files into commits/))

    view.rerender(
      <CopilotCommitPanel filesSelectedCount={1} isWorking={false} />
    )
    assert.ok(screen.getByText(/split the 1 selected file into commits/))
  })

  it('celebrates its entrance and then idles', () => {
    const view = render(
      <CopilotCommitPanel filesSelectedCount={1} isWorking={false} />
    )

    assert.ok(view.container.querySelector('.copilot-sprite-celebrate'))

    advanceThroughPhases(33, 1056)
    assert.ok(view.container.querySelector('.copilot-sprite-idle'))
  })

  it('thinks while Copilot is working', () => {
    const view = render(
      <CopilotCommitPanel filesSelectedCount={1} isWorking={false} />
    )

    view.rerender(
      <CopilotCommitPanel filesSelectedCount={1} isWorking={true} />
    )

    const panel = view.container.querySelector('.copilot-commit-panel')
    assert.ok(panel?.classList.contains('working'))
    assert.ok(view.container.querySelector('.copilot-sprite-thinking'))
    assert.ok(screen.getByText('Copilot is on it…'))

    view.rerender(
      <CopilotCommitPanel filesSelectedCount={1} isWorking={false} />
    )

    // The thinking animation winds down before going back to idle
    assert.ok(view.container.querySelector('.copilot-sprite-thinking'))
    advanceThroughPhases(33, 429, 1390, 429)
    assert.ok(view.container.querySelector('.copilot-sprite-idle'))
  })
})
