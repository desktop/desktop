import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'
import { CopilotCommitPanel } from '../../../src/ui/changes/copilot-commit-panel'
import { AssistedCommitRunState } from '../../../src/models/assisted-commit-run'
import { ErrorWithMetadata } from '../../../src/lib/error-with-metadata'
import { fireEvent, render, screen } from '../../helpers/ui/render'

describe('Copilot commit run panel', () => {
  for (const [kind, caption] of [
    ['preparing', 'Preparing selected changes'],
    ['capturing', 'Freezing selected changes'],
    ['analyzing', 'Planning selected changes'],
    ['summarizing-selection', 'Writing one message'],
    ['validating', 'Checking the complete commit plan'],
    ['finishing', 'Refreshing local commits'],
  ] as const) {
    it(`announces ${kind} and exposes keyboard-reachable Cancel`, async () => {
      let cancelled = 0
      render(
        <CopilotCommitPanel
          filesSelectedCount={2}
          isWorking={true}
          runState={{ kind, runId: 'run', cancelRequested: false }}
          onCancel={() => cancelled++}
        />
      )
      assert.ok(screen.getByText(new RegExp(caption), { selector: '.title' }))
      const button = screen.getByRole('button', { name: 'Cancel' })
      button.focus()
      assert.strictEqual(document.activeElement, button)
      fireEvent.click(button)
      assert.strictEqual(cancelled, 1)
    })
  }

  it('shows real commit index, count and title, not completion inferred from progress', async () => {
    render(
      <CopilotCommitPanel
        filesSelectedCount={2}
        isWorking={true}
        runState={{
          kind: 'committing',
          runId: 'run',
          index: 1,
          total: 3,
          title: 'Exact generated title',
          cancelRequested: false,
        }}
        onCancel={() => {}}
      />
    )
    assert.ok(
      screen.getByText('Creating commit 2 of 3: Exact generated title', {
        selector: '.title',
      })
    )
    assert.ok(screen.getByText('Exact generated title'))
    assert.ok(screen.getByRole('button', { name: 'Cancel' }))
    assert.strictEqual(screen.queryByText(/Committed/), null)
  })

  it('shows cancellation without hiding Cancel, and disables it only through verified rollback', async () => {
    const view = render(
      <CopilotCommitPanel
        filesSelectedCount={1}
        isWorking={true}
        runState={{ kind: 'analyzing', runId: 'run', cancelRequested: true }}
        onCancel={() => {}}
      />
    )
    assert.ok(
      screen.getByText('Cancelling the commit run…', { selector: '.title' })
    )
    assert.notStrictEqual(
      screen
        .getByRole('button', { name: 'Cancel' })
        .getAttribute('aria-disabled'),
      'true'
    )
    view.rerender(
      <CopilotCommitPanel
        filesSelectedCount={1}
        isWorking={true}
        runState={{ kind: 'rolling-back', runId: 'run' }}
        onCancel={() => {}}
      />
    )
    assert.ok(
      screen.getByText('Undoing commits from this run…', { selector: '.title' })
    )
    assert.strictEqual(
      screen
        .getByRole('button', { name: 'Cancel' })
        .getAttribute('aria-disabled'),
      'true'
    )
  })

  it('keeps recovery errors explicit with retry/details, never a dismiss-to-ready escape', async () => {
    const state: AssistedCommitRunState = {
      kind: 'error',
      runId: 'run',
      retry: 'recovery',
      selectionNeedsReview: true,
      settling: false,
      error: new ErrorWithMetadata(new Error('External HEAD changed'), {}),
    }
    let retry = 0
    let details = 0
    const view = render(
      <CopilotCommitPanel
        filesSelectedCount={1}
        isWorking={false}
        runState={state}
        onRetryRecovery={() => retry++}
        onErrorDetails={() => details++}
        onDismissError={() => {}}
      />
    )
    assert.ok(screen.getByRole('alert'))
    assert.ok(screen.getByText('External HEAD changed'))
    assert.ok(screen.getByText(/Review and reselect/))
    assert.strictEqual(screen.queryByRole('button', { name: 'Dismiss' }), null)
    assert.strictEqual(
      view.container.querySelector('.copilot-commit-panel.working'),
      null
    )
    fireEvent.click(screen.getByRole('button', { name: 'Retry rollback' }))
    fireEvent.click(screen.getByRole('button', { name: 'Details' }))
    assert.strictEqual(retry, 1)
    assert.strictEqual(details, 1)
  })

  it('updates the actual live region for each phase and commit while remaining busy', async () => {
    const view = render(
      <CopilotCommitPanel
        filesSelectedCount={1}
        isWorking={true}
        runState={{ kind: 'analyzing', runId: 'run', cancelRequested: false }}
      />
    )
    const live = () =>
      view.container.querySelector('[aria-live="polite"]')?.textContent
    assert.match(live() ?? '', /Planning selected changes/)
    view.rerender(
      <CopilotCommitPanel
        filesSelectedCount={1}
        isWorking={true}
        runState={{
          kind: 'committing',
          runId: 'run',
          index: 0,
          total: 2,
          title: 'Focused title',
          cancelRequested: false,
        }}
      />
    )
    assert.match(live() ?? '', /Creating commit 1 of 2: Focused title/)
    view.rerender(
      <CopilotCommitPanel
        filesSelectedCount={1}
        isWorking={true}
        runState={{ kind: 'rolling-back', runId: 'run' }}
      />
    )
    assert.match(live() ?? '', /Undoing commits/)
  })

  for (const retry of [null, 'recovery', 'refresh'] as const) {
    it(`keeps ${
      retry === null ? 'Dismiss' : 'Retry'
    } disabled while error ownership is settling`, async () => {
      let acted = 0
      const state: AssistedCommitRunState = {
        kind: 'error',
        runId: 'run',
        error: new ErrorWithMetadata(new Error('Run stopped'), {}),
        retry,
        settling: true,
        selectionNeedsReview: false,
      }
      render(
        <CopilotCommitPanel
          filesSelectedCount={1}
          isWorking={true}
          runState={state}
          onRetryRecovery={() => acted++}
          onDismissError={() => acted++}
        />
      )
      const button = screen.getByRole('button', {
        name:
          retry === null
            ? 'Dismiss'
            : retry === 'recovery'
            ? 'Retry rollback'
            : 'Retry refresh',
      })
      assert.strictEqual(button.getAttribute('aria-disabled'), 'true')
      fireEvent.click(button)
      assert.strictEqual(acted, 0)
      assert.ok(screen.getByText('Finishing repository refresh…'))
    })
  }

  it('returns to idle after remount without retaining old progress or exposing the mascot to AT', async () => {
    const initial = render(
      <CopilotCommitPanel
        filesSelectedCount={1}
        isWorking={true}
        runState={{ kind: 'analyzing', runId: 'run', cancelRequested: false }}
        onCancel={() => {}}
      />
    )
    initial.unmount()
    const view = render(
      <CopilotCommitPanel
        filesSelectedCount={0}
        isWorking={false}
        allowEmptyCommit={true}
        runState={{ kind: 'idle' }}
      />
    )
    assert.ok(screen.getByText('Create an empty commit'))
    assert.strictEqual(screen.queryByRole('button', { name: 'Cancel' }), null)
    assert.strictEqual(
      view.container
        .querySelector('.copilot-stage')
        ?.getAttribute('aria-hidden'),
      'true'
    )
  })
})
