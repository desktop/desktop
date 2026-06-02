import assert from 'node:assert'
import { describe, it } from 'node:test'

import { routeOpenRepositoryWindow } from '../../../src/main-process/open-repository-window-router'

class TestWindow {
  public repositoryPath: string | null
  public routedPaths = new Array<string>()
  public focusCalls = 0
  public revealAndFocusCalls = 0

  public constructor(repositoryPath: string | null = null) {
    this.repositoryPath = repositoryPath
  }

  public focus() {
    this.focusCalls += 1
  }

  public revealAndFocus() {
    this.revealAndFocusCalls += 1
  }

  public sendCLIAction(action: { path: string }) {
    this.routedPaths.push(action.path)
  }
}

describe('open-repository-window-router', () => {
  it('focuses an existing matching window', () => {
    const window = new TestWindow('/tmp/repo')
    let createdWindowCount = 0

    routeOpenRepositoryWindow(
      { kind: 'open-repository', path: '/tmp/foo/../repo' },
      {
        getWindows: () => [window],
        onDidLoad: () => assert.fail('should not queue onDidLoad'),
        createWindow: () => {
          createdWindowCount += 1
          return new TestWindow()
        },
        setPendingRepositoryPathForNextWindow: () =>
          assert.fail('should not set a pending path'),
      }
    )

    assert.equal(window.revealAndFocusCalls, 1)
    assert.equal(createdWindowCount, 0)
  })

  it('queues the first window and records its repository path before dispatch', () => {
    let pendingRepositoryPath: string | null = null
    let didLoadHandler: (window: TestWindow) => void = (_window: TestWindow) => {
      assert.fail('expected onDidLoad handler to be registered')
    }

    routeOpenRepositoryWindow(
      { kind: 'open-repository', path: '/tmp/repo' },
      {
        getWindows: () => [],
        onDidLoad: fn => {
          didLoadHandler = fn
        },
        createWindow: () => assert.fail('should not create a window'),
        setPendingRepositoryPathForNextWindow: path => {
          pendingRepositoryPath = path
        },
      }
    )

    assert.equal(pendingRepositoryPath, '/tmp/repo')

    const window = new TestWindow(pendingRepositoryPath)
    didLoadHandler(window)

    assert.equal(window.focusCalls, 1)
    assert.equal(window.repositoryPath, '/tmp/repo')
    assert.deepEqual(window.routedPaths, ['/tmp/repo'])
  })

  it('reuses a newly created window for duplicate open actions before it loads', () => {
    const windows = [new TestWindow('/tmp/other-repo')]
    let createdWindowCount = 0

    const createWindow = (onWindowDidLoad: (window: TestWindow) => void) => {
      createdWindowCount += 1
      const window = new TestWindow()
      windows.push(window)
      // The window is still loading, so we intentionally don't invoke the
      // callback here.
      void onWindowDidLoad
      return window
    }

    routeOpenRepositoryWindow(
      { kind: 'open-repository', path: '/tmp/repo' },
      {
        getWindows: () => windows,
        onDidLoad: () => assert.fail('should not queue onDidLoad'),
        createWindow,
        setPendingRepositoryPathForNextWindow: () =>
          assert.fail('should not set a pending path'),
      }
    )

    assert.equal(createdWindowCount, 1)
    assert.equal(windows[1].repositoryPath, '/tmp/repo')
    assert.deepEqual(windows[1].routedPaths, [])

    routeOpenRepositoryWindow(
      { kind: 'open-repository', path: '/tmp/repo' },
      {
        getWindows: () => windows,
        onDidLoad: () => assert.fail('should not queue onDidLoad'),
        createWindow,
        setPendingRepositoryPathForNextWindow: () =>
          assert.fail('should not set a pending path'),
      }
    )

    assert.equal(createdWindowCount, 1)
    assert.equal(windows[1].revealAndFocusCalls, 1)
  })
})
