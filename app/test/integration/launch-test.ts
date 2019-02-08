// This shouldn't be necessary, but without this CI fails on Windows. Seems to
// be a bug in TS itself or ts-node.
/// <reference path="../../../node_modules/@types/node/index.d.ts" />

import { Application } from 'spectron'
import * as path from 'path'
import { getDistPath, getExecutableName } from '../../../script/dist-info'

describe('App', function(this: any) {
  let app: Application

  beforeEach(function() {
    const distPath = getDistPath()
    const programName = getExecutableName()

    let appPath: string

    if (process.platform === 'win32') {
      appPath = path.join(distPath, `${programName}.exe`)
    } else if (process.platform === 'darwin') {
      appPath = path.join(
        distPath,
        `${programName}.app`,
        'Contents',
        'macOS',
        programName
      )
    } else if (process.platform === 'linux') {
      appPath = path.join(distPath, `desktop`)
    } else {
      throw new Error(`Unsupported platform: ${process.platform}`)
    }

    console.log(`launching app '${appPath}'`)

    app = new Application({
      path: appPath,
    })
    return app.start()
  })

  afterEach(function() {
    if (app && app.isRunning()) {
      return app.stop()
    }
    return Promise.resolve()
  })

  it('opens a window on launch', async () => {
    await app.client.waitUntil(() => app.browserWindow.isVisible(), 5000)

    const count = await app.client.getWindowCount()
    expect(count).toBe(1)

    const window = app.browserWindow
    expect(window.isVisible()).resolves.toBe(true)
    expect(window.isMinimized()).resolves.toBe(false)

    expect(window.isMinimized()).resolves.toBe(false)

    const bounds = await window.getBounds()

    expect(bounds.width).toBeGreaterThan(0)
    expect(bounds.height).toBeGreaterThan(0)
  })
})
