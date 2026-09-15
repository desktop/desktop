import assert from 'node:assert'
import { afterEach, describe, it, mock } from 'node:test'
import * as React from 'react'

import { AppTheme } from '../../../src/ui/app-theme'
import { ApplicationTheme } from '../../../src/ui/lib/application-theme'
import { fireEvent, render } from '../../helpers/ui/render'

type TUnlinkBehavior = (path: string) => Promise<void>

let unlinkBehavior: TUnlinkBehavior = async () => {}

mock.module('fs/promises', {
  namedExports: {
    unlink: (path: string) => unlinkBehavior(path),
  },
})

async function getConfigLockFileExists() {
  return (await import('../../../src/ui/lib/config-lock-file-exists'))
    .ConfigLockFileExists
}

afterEach(async () => {
  unlinkBehavior = async () => {}
  document.body.className = ''
  document.body.style.removeProperty('--background-color')
  document.documentElement.style.colorScheme = ''
})

describe('helper side-effect surfaces', () => {
  it('applies theme classes, updates color scheme, and clears theme classes on unmount', async () => {
    const electron = await import('electron')
    const previousSend = electron.ipcRenderer.send
    const sends: Array<[string, string]> = []

    electron.ipcRenderer.send = (channel: string, value: string) => {
      sends.push([channel, value])
    }

    try {
      document.body.style.setProperty('--background-color', 'rgb(1, 2, 3)')

      const view = render(<AppTheme theme={ApplicationTheme.Dark} />)

      assert.ok(document.body.classList.contains('theme-dark'))
      assert.equal(document.documentElement.style.colorScheme, 'dark')
      assert.deepEqual(sends, [
        ['update-window-background-color', 'rgb(1, 2, 3)'],
      ])

      view.rerender(<AppTheme theme={ApplicationTheme.Light} />)

      assert.equal(document.body.classList.contains('theme-dark'), false)
      assert.ok(document.body.classList.contains('theme-light'))
      assert.equal(document.documentElement.style.colorScheme, 'light')
      assert.deepEqual(sends.at(-1), [
        'update-window-background-color',
        'rgb(1, 2, 3)',
      ])

      view.unmount()

      assert.equal(document.body.classList.contains('theme-light'), false)
    } finally {
      electron.ipcRenderer.send = previousSend
    }
  })

  it('deletes the config lock file and retries when deletion succeeds or file is already gone', async () => {
    const deletedPaths: Array<string> = []
    let deletedCount = 0
    const errors: Array<string> = []

    unlinkBehavior = async path => {
      deletedPaths.push(path)
      if (path.endsWith('.missing.lock')) {
        const error = Object.assign(new Error('missing'), { code: 'ENOENT' })
        throw error
      }
    }

    const ConfigLockFileExists = await getConfigLockFileExists()
    const view = render(
      <ConfigLockFileExists
        lockFilePath="/tmp/repo.lock"
        onLockFileDeleted={() => {
          deletedCount++
        }}
        onError={(error: Error) => {
          errors.push(error.message)
        }}
      />
    )

    fireEvent.click(view.container.querySelector('.link-button-component')!)
    await Promise.resolve()

    view.rerender(
      <ConfigLockFileExists
        lockFilePath="/tmp/repo.missing.lock"
        onLockFileDeleted={() => {
          deletedCount++
        }}
        onError={(error: Error) => {
          errors.push(error.message)
        }}
      />
    )

    fireEvent.click(view.container.querySelector('.link-button-component')!)
    await Promise.resolve()

    assert.deepEqual(deletedPaths, ['/tmp/repo.lock', '/tmp/repo.missing.lock'])
    assert.equal(deletedCount, 2)
    assert.deepEqual(errors, [])
  })

  it('reports config lock deletion failures other than ENOENT', async () => {
    let deletedCount = 0
    const errors: Array<string> = []

    unlinkBehavior = async () => {
      const error = Object.assign(new Error('permission denied'), {
        code: 'EACCES',
      })
      throw error
    }

    const ConfigLockFileExists = await getConfigLockFileExists()
    const view = render(
      <ConfigLockFileExists
        lockFilePath="/tmp/repo.lock"
        onLockFileDeleted={() => {
          deletedCount++
        }}
        onError={(error: Error) => {
          errors.push(error.message)
        }}
      />
    )

    fireEvent.click(view.container.querySelector('.link-button-component')!)
    await Promise.resolve()

    assert.equal(deletedCount, 0)
    assert.deepEqual(errors, ['permission denied'])
  })
})
