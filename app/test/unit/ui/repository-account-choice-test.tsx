import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as React from 'react'
import { Account } from '../../../src/models/account'
import { RepositoryAccountChoice } from '../../../src/ui/repository-account-choice'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

class SizedResizeObserver implements ResizeObserver {
  public constructor(private readonly callback: ResizeObserverCallback) {}

  public observe(target: Element) {
    Object.defineProperty(target, 'offsetWidth', {
      configurable: true,
      value: 500,
    })
    Object.defineProperty(target, 'offsetHeight', {
      configurable: true,
      value: 300,
    })
    setTimeout(() => {
      this.callback(
        [
          {
            target,
            contentRect: { width: 500, height: 300 },
          } as ResizeObserverEntry,
        ],
        this
      )
    }, 0)
  }

  public unobserve() {}
  public disconnect() {}
}

describe('repository account choice', () => {
  let restoreSend: (() => void) | undefined
  const originalWindowResizeObserver = window.ResizeObserver

  beforeEach(async () => {
    window.ResizeObserver = SizedResizeObserver
    const electron = await import('electron')
    const previousSend = electron.ipcRenderer.send
    electron.ipcRenderer.send = () => {}
    restoreSend = () => {
      electron.ipcRenderer.send = previousSend
    }
  })

  afterEach(() => {
    restoreSend?.()
    window.ResizeObserver = originalWindowResizeObserver
  })

  it('requires selecting one of the available accounts before associating', async () => {
    const first = new Account(
      'joan',
      'https://api.github.com',
      'one',
      [],
      '',
      1,
      ''
    )
    const second = new Account(
      'alex',
      'https://api.github.com',
      'two',
      [],
      '',
      2,
      ''
    )
    let selected: Account | undefined
    render(
      <RepositoryAccountChoice
        repositoryName="my-project"
        accounts={[first, second]}
        onSelected={account => {
          selected = account
        }}
        onDismissed={() => {}}
      />
    )

    const submit = screen.getByText('Associate account')
    assert.strictEqual(submit.getAttribute('aria-disabled'), 'true')
    fireEvent.click(screen.getByText('Choose an account'))
    fireEvent.click(await waitFor(() => screen.getByText('@alex')))
    assert.notStrictEqual(submit.getAttribute('aria-disabled'), 'true')
    fireEvent.click(submit)
    assert.strictEqual(selected, second)
  })
})
