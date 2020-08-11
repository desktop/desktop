// This shouldn't be necessary, but without this CI fails on Windows. Seems to
// be a bug in TS itself or ts-node.
/// <reference types="node" />

import { Application } from 'spectron'
import * as path from 'path'

describe('App', function (this: any) {
  let app: Application

  beforeEach(function () {
    let appPath = path.join(
      __dirname,
      '..',
      '..',
      '..',
      'node_modules',
      '.bin',
      'electron'
    )
    if (process.platform === 'win32') {
      appPath += '.cmd'
    }

    const root = path.resolve(__dirname, '..', '..', '..')

    app = new Application({
      path: appPath,
      args: [path.join(root, 'out')],
    })
    return app.start()
  })

  afterEach(function () {
    if (app && app.isRunning()) {
      return app.stop()
    }
    return Promise.resolve()
  })

  it('opens a window on launch', async () => {
    await app.client.waitUntil(
      () => Promise.resolve(app.browserWindow.isVisible()),
      { timeout: 5000 }
    )

    const count = await app.client.getWindowCount()
    // When running tests against development versions of Desktop
    // (which usually happens locally when developing), the number
    // of windows will be greater than 1, since the devtools are
    // considered a window.
    expect(count).toBeGreaterThan(0)

    const window = app.browserWindow
    expect(window.isVisible()).resolves.toBe(true)
    expect(window.isMinimized()).resolves.toBe(false)

    expect(window.isMinimized()).resolves.toBe(false)

    const bounds = await window.getBounds()

    expect(bounds.width).toBeGreaterThan(0)
    expect(bounds.height).toBeGreaterThan(0)
  })
})
