// This shouldn't be necessary, but without this CI fails on Windows. Seems to
// be a bug in TS itself or ts-node.
/// <reference path="../../../node_modules/@types/node/index.d.ts" />

import { Application } from 'spectron'
import { pathExists } from 'fs-extra'
import { getEntryPointForApp } from '../../../script/dist-info'

describe('App', function(this: any) {
  let app: Application

  beforeEach(async () => {
    const appPath = getEntryPointForApp()

    const exists = await pathExists(appPath)
    if (!exists) {
      throw new Error(
        `Application expected at ${appPath} was not found on disk. Ensure you have built the app for production mode before running the integration tests.`
      )
    }

    app = new Application({
      path: appPath,
    })
    await app.start()
  })

  afterEach(async () => {
    if (app && app.isRunning()) {
      await app.stop()
    }
  })

  it('opens a window on launch', async () => {
    await app.client.waitUntil(() => app.browserWindow.isVisible(), 5000)

    const count = await app.client.getWindowCount()
    expect(count).toBe(1)

    const window = app.browserWindow
    const isVisible = await window.isVisible()
    expect(isVisible).toBe(true)

    const isMinimized = await window.isMinimized()
    expect(isMinimized).toBe(false)

    const isMaximized = await window.isMaximized()
    expect(isMaximized).toBe(false)

    const bounds = await window.getBounds()

    expect(bounds.width).toBeGreaterThan(0)
    expect(bounds.height).toBeGreaterThan(0)
  })
})
