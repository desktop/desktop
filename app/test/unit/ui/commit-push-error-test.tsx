import { render, screen, fireEvent } from '../../helpers/ui/render'
import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'
import { ipcRenderer } from 'electron'
import { AppError } from '../../../src/ui/app-error'
import { ErrorWithMetadata } from '../../../src/lib/error-with-metadata'
import { ICommitPushRequest } from '../../../src/lib/commit-push'
import { RetryAction, RetryActionType } from '../../../src/models/retry-actions'
import { Repository } from '../../../src/models/repository'

describe('manual commit push error', () => {
  for (const pushed of [false, true]) {
    it(`offers only ${
      pushed ? 'refresh' : 'push'
    } retry with local success retained`, t => {
      const previousSend = ipcRenderer.send
      ipcRenderer.send = () => {}
      const repository = new Repository('/synthetic', 1, null, false)
      const request: ICommitPushRequest = {
        repository,
        head: { ref: 'refs/heads/main', sha: 'a'.repeat(40) },
        destination: {
          kind: 'unavailable',
          error: new Error('Synthetic destination'),
        },
        verifyAuthorization: () => {},
        publication: {
          pushed,
          upstreamConfigured: false,
          resources: { locks: [] },
        },
      }
      const retry: RetryAction = {
        type: RetryActionType.Push,
        repository,
        commit: request,
      }
      let received: RetryAction | undefined
      const view = render(
        <AppError
          error={
            new ErrorWithMetadata(new Error('Synthetic rejection'), {
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
      assert.ok(
        screen.getByText(
          pushed
            ? 'Commit pushed, refresh failed'
            : 'Commit saved locally, push failed'
        )
      )
      fireEvent.click(
        screen.getByRole('button', {
          name: pushed ? 'Retry refresh' : 'Retry push',
          hidden: true,
        })
      )
      assert.strictEqual(received, retry)
      assert.strictEqual(request.publication.pushed, pushed)
    })
  }
})
