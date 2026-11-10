import { render, screen, fireEvent } from '../../helpers/ui/render'
import assert from 'node:assert'
import { it } from 'node:test'
import * as React from 'react'
import { ipcRenderer } from 'electron'
import { AppError } from '../../../src/ui/app-error'
import { ErrorWithMetadata } from '../../../src/lib/error-with-metadata'
import { RetryAction, RetryActionType } from '../../../src/models/retry-actions'
import { Repository } from '../../../src/models/repository'

it('offers the ordinary Push retry without retaining a commit-run capability', t => {
  const previousSend = ipcRenderer.send
  ipcRenderer.send = () => {}
  const retry: RetryAction = {
    type: RetryActionType.Push,
    repository: new Repository('/synthetic', 1, null, false),
  }
  let received: RetryAction | undefined
  const view = render(
    <AppError
      error={
        new ErrorWithMetadata(new Error('Synthetic push rejection'), {
          retryAction: retry,
        })
      }
      onDismissed={() => {}}
      onShowPopup={() => {}}
      onRetryAction={action => (received = action)}
    />
  )
  t.after(() => {
    view.unmount()
    ipcRenderer.send = previousSend
  })
  assert.ok(screen.getByText('Failed to push'))
  fireEvent.click(
    screen.getByRole('button', { name: 'Retry push', hidden: true })
  )
  assert.strictEqual(received, retry)
  assert.deepStrictEqual(Object.keys(retry), ['type', 'repository'])
})
