import assert from 'node:assert'
import { afterEach, describe, it } from 'node:test'
import * as React from 'react'

import { DiffSelection, DiffSelectionType } from '../../../src/models/diff'
import { Repository } from '../../../src/models/repository'
import {
  AppFileStatusKind,
  GitStatusEntry,
  WorkingDirectoryFileChange,
} from '../../../src/models/status'
import { IConflictResolutionProgress } from '../../../src/lib/copilot-conflict-resolution'
import { ResolveConflictsWithCopilotDialog } from '../../../src/ui/resolve-conflicts-with-copilot'
import type { Dispatcher } from '../../../src/ui/dispatcher'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

const originalEvent = globalThis.Event
let restoreIpcSend: (() => void) | null = null

class TestDispatcher {
  public started = new Array<Repository>()
  private onProgress: ((progress: IConflictResolutionProgress) => void) | null =
    null
  private resolveStart: (() => void) | null = null

  public async startCopilotConflictResolution(
    repository: Repository,
    onProgress?: (progress: IConflictResolutionProgress) => void
  ) {
    this.started.push(repository)
    this.onProgress = onProgress ?? null

    await new Promise<void>(resolve => {
      this.resolveStart = resolve
    })
  }

  public reportProgress(progress: IConflictResolutionProgress) {
    this.onProgress?.(progress)
  }

  public completeResolution() {
    this.resolveStart?.()
  }
}

function toDispatcher(dispatcher: TestDispatcher): Dispatcher {
  return dispatcher as unknown as Dispatcher
}

function conflictedFile(path = 'src/conflict.ts') {
  return new WorkingDirectoryFileChange(
    path,
    {
      kind: AppFileStatusKind.Conflicted,
      entry: {
        kind: 'conflicted',
        action: 'both-modified' as any,
        us: GitStatusEntry.UpdatedButUnmerged,
        them: GitStatusEntry.UpdatedButUnmerged,
      },
      conflictMarkerCount: 1,
    },
    DiffSelection.fromInitialSelection(DiffSelectionType.All)
  )
}

function getFileProgressItem(container: HTMLElement, path: string) {
  const item = container.querySelector(
    `.copilot-conflict-progress-file[data-path="${path}"]`
  )

  assert.notEqual(item, undefined)
  return item!
}

async function stubIpcSend() {
  const electron = await import('electron')
  const previousSend = electron.ipcRenderer.send
  electron.ipcRenderer.send = () => {}
  restoreIpcSend = () => {
    electron.ipcRenderer.send = previousSend
    restoreIpcSend = null
  }
}

afterEach(() => {
  globalThis.Event = originalEvent
  restoreIpcSend?.()
})

describe('ResolveConflictsWithCopilotDialog', () => {
  it('lists conflicted files before the user starts resolution', async () => {
    const dispatcher = new TestDispatcher()
    const repository = new Repository('/tmp/repo', 1, null, false)

    await stubIpcSend()

    const view = render(
      <ResolveConflictsWithCopilotDialog
        dispatcher={toDispatcher(dispatcher)}
        repository={repository}
        conflictedFiles={[
          conflictedFile('src/one.ts'),
          conflictedFile('src/two.ts'),
        ]}
        canResolveWithCopilot={true}
        onDismissed={() => {}}
      />
    )

    assert.match(
      getFileProgressItem(view.container, 'src/one.ts').textContent ?? '',
      /Pending/
    )
    assert.match(
      getFileProgressItem(view.container, 'src/two.ts').textContent ?? '',
      /Pending/
    )
  })

  it('updates conflicted file progress while Copilot resolves files', async () => {
    const dispatcher = new TestDispatcher()
    const repository = new Repository('/tmp/repo', 1, null, false)

    await stubIpcSend()

    const view = render(
      <ResolveConflictsWithCopilotDialog
        dispatcher={toDispatcher(dispatcher)}
        repository={repository}
        conflictedFiles={[
          conflictedFile('src/one.ts'),
          conflictedFile('src/two.ts'),
        ]}
        canResolveWithCopilot={true}
        onDismissed={() => {}}
      />
    )

    const submitButton = Array.from(
      view.container.querySelectorAll('button')
    ).find(button => button.textContent?.includes('Resolve with Copilot'))

    assert.notEqual(submitButton, undefined)
    fireEvent.click(submitButton!)

    await waitFor(() => {
      assert.equal(dispatcher.started.length, 1)
    })

    dispatcher.reportProgress({
      filesResolved: 1,
      filesTotal: 2,
      resolvedFilePaths: ['src/one.ts'],
      activeFilePaths: ['src/two.ts'],
    })

    await waitFor(() => {
      assert.match(
        getFileProgressItem(view.container, 'src/one.ts').textContent ?? '',
        /Done/
      )
      assert.match(
        getFileProgressItem(view.container, 'src/two.ts').textContent ?? '',
        /Resolving/
      )
    })

    dispatcher.reportProgress({
      filesResolved: 2,
      filesTotal: 2,
      resolvedFilePaths: ['src/one.ts', 'src/two.ts'],
      activeFilePaths: [],
    })

    await waitFor(() => {
      assert.match(
        getFileProgressItem(view.container, 'src/two.ts').textContent ?? '',
        /Done/
      )
    })

    dispatcher.completeResolution()
  })

  it('starts Copilot conflict resolution only after the user opts in', async () => {
    const dispatcher = new TestDispatcher()
    const repository = new Repository('/tmp/repo', 1, null, false)
    let dismissed = 0

    await stubIpcSend()

    const view = render(
      <ResolveConflictsWithCopilotDialog
        dispatcher={toDispatcher(dispatcher)}
        repository={repository}
        conflictedFiles={[conflictedFile()]}
        canResolveWithCopilot={true}
        onDismissed={() => {
          dismissed++
        }}
      />
    )

    assert.equal(dispatcher.started.length, 0)

    const submitButton = Array.from(
      view.container.querySelectorAll('button')
    ).find(button => button.textContent?.includes('Resolve with Copilot'))

    assert.notEqual(submitButton, undefined)
    fireEvent.click(submitButton!)
    dispatcher.completeResolution()

    await waitFor(() => {
      assert.deepEqual(dispatcher.started, [repository])
      assert.equal(dismissed, 1)
    })
  })

  it('does not show the Copilot action when conflict resolution is unavailable', async () => {
    const dispatcher = new TestDispatcher()
    const repository = new Repository('/tmp/repo', 1, null, false)

    await stubIpcSend()

    render(
      <ResolveConflictsWithCopilotDialog
        dispatcher={toDispatcher(dispatcher)}
        repository={repository}
        conflictedFiles={[conflictedFile()]}
        canResolveWithCopilot={false}
        onDismissed={() => {}}
      />
    )

    assert.equal(
      screen.queryByRole('button', { name: 'Resolve with Copilot' }),
      null
    )
    assert.ok(
      screen.getByText('Resolve conflicts before generating a commit message')
    )
  })
})
