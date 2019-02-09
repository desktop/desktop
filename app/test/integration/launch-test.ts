// This shouldn't be necessary, but without this CI fails on Windows. Seems to
// be a bug in TS itself or ts-node.
/// <reference path="../../../node_modules/@types/node/index.d.ts" />

import { Application } from 'spectron'
import { pathExists, mkdirp } from 'fs-extra'
import * as Path from 'path'
import { getEntryPointForApp } from '../../../script/dist-info'
import { getLogsDirectory } from '../../../script/review-logs'

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

    const logsDir = getLogsDirectory()

    await mkdirp(logsDir)

    console.log(`Running Spectron and logging to ${logsDir}`)

    app = new Application({
      path: appPath,
      chromeDriverLogPath: Path.join(logsDir, 'chrome-driver.log'),
      webdriverLogPath: Path.join(logsDir, 'web-driver'),
    })
    await app.start()
  })

  afterEach(async () => {
    if (app && app.isRunning()) {
      //
      // this chunk of code is rather annoying so I'll explain what we're trying
      // to do here for any future readers of this code
      //
      try {
        // This is the expected way to end the spectron test, but it may throw
        // an error from the internal ChromeDriver and WebDriver dependencies
        // it sets up to perform the test.
        await app.stop()
      } catch (err) {
        // Because of the order of how Spectron's Application wrapper cleans up
        // inside `stop()` it tries to interact with the app before it cleans up
        // the other things.
        //
        // This is the source for the v4 version:
        // https://github.com/electron/spectron/blob/1c3883f3db7f807b39a6ac505805ea941b06c57b/lib/application.js#L56-L80
        //
        // If this fails for whatever reason, we need to do our best guess at
        // cleaning up any running components. Errors I've seen raised recently
        // include:
        //  - application is in an unknown state
        //  - WebDriver is unable to reach the running app
        //  - etc
        //

        // First, we signal to the WebDriver client to close itself
        app.client.close()

        // Then, we try and close the ChromeDriver client, which isn't visible
        // from the typings, so we have to hack around it
        const anyApp = app as any
        anyApp.chromeDriver.stop()
      }
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
