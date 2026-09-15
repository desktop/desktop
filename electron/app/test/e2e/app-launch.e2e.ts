/**
 * E2E tests for GitHub Desktop using Playwright + Electron.
 *
 * These tests launch the real production-built app, interact with it
 * via Playwright, and verify core functionality end-to-end. Video and
 * trace recording behavior is configured in the shared Electron fixtures
 * (see ./e2e-fixtures), not directly in playwright.config.ts.
 */

import {
  test,
  expect,
  controlMockServer,
  getMockRequests,
  dismissMoveToApplicationsDialog,
  terminateWindowsUpdaterProcesses,
} from './e2e-fixtures'
import {
  smokeRepoFileContents,
  smokeRepoFileName,
  smokeRepoPath,
  getSmokeRepoCurrentBranch,
  getSmokeRepoHeadMessage,
  getSmokeRepoStatus,
} from './test-helpers'
import { getVersion } from '../../package-info'
import type { Locator, Page } from '@playwright/test'

// All tests run sequentially in the same Electron session.
test.describe.configure({ mode: 'serial' })

async function failIfAppErrorDialogIsVisible(page: Page) {
  const appErrorDialog = page.locator('dialog#app-error')
  const isVisible = await appErrorDialog.isVisible().catch(() => false)

  if (!isVisible) {
    return
  }

  const title =
    (await appErrorDialog.locator('.dialog-header h1').textContent()) ?? ''
  const description =
    (await page
      .locator('#app-error-description')
      .textContent()
      .catch(() => null)) ?? ''

  throw new Error(
    `App error dialog blocked the E2E flow. Title: ${title.trim()} Description: ${description.trim()}`
  )
}

function isMockUpdateRequest(url: string) {
  return (
    url.includes('/update') ||
    url.includes('/RELEASES') ||
    url.endsWith('.nupkg') ||
    url.startsWith('/download/')
  )
}

function getReleaseChannelForE2E() {
  const configuredChannel = process.env.RELEASE_CHANNEL

  if (configuredChannel !== undefined) {
    return configuredChannel
  }

  const version = getVersion()

  if (version.includes('test')) {
    return 'test'
  }

  if (version.includes('beta')) {
    return 'beta'
  }

  return 'production'
}

const releaseChannel = getReleaseChannelForE2E()
const shouldAutoCheckForUpdatesOnLaunch =
  releaseChannel !== 'development' && releaseChannel !== 'test'

async function clickCheckForUpdatesIfAvailable(target: Page | Locator) {
  const checkBtn = target.locator(
    'button.button-component:has-text("Check for Updates")'
  )

  if (
    (await checkBtn.isVisible().catch(() => false)) &&
    (await checkBtn.isEnabled().catch(() => false))
  ) {
    await checkBtn.click()
  }
}

// ── Smoke tests ─────────────────────────────────────────────────────

test.describe('GitHub Desktop - App Launch', () => {
  test('should launch, complete welcome flow, commit, and switch branches', async ({
    mainWindow: page,
  }) => {
    // Wait for the React app to mount
    await page.waitForFunction(
      () =>
        (document.getElementById('desktop-app-container')?.innerHTML.length ??
          0) > 100,
      null,
      { timeout: 30000 }
    )

    // ── Welcome flow ────────────────────────────────────────────────
    const skipButton = page.locator('a.skip-button')
    await skipButton.waitFor({ state: 'visible', timeout: 30000 })
    await skipButton.click()

    const nameInput = page.locator('input[placeholder="Your Name"]')
    await nameInput.waitFor({ state: 'visible', timeout: 15000 })
    if ((await nameInput.inputValue()) === '') {
      await nameInput.fill('GitHub Desktop E2E')
    }

    const emailInput = page.locator(
      'input[placeholder="your-email@example.com"]'
    )
    if ((await emailInput.inputValue()) === '') {
      await emailInput.fill('desktop-e2e@example.com')
    }

    await page.locator('button:has-text("Finish")').click()
    await page.waitForSelector('#welcome', { state: 'hidden', timeout: 15000 })

    await dismissMoveToApplicationsDialog(page)

    // ── Repository view ─────────────────────────────────────────────
    const repoFile = page
      .locator(`//*[contains(normalize-space(), "${smokeRepoFileName}")]`)
      .first()
    const addButton = page
      .locator(
        '//*[contains(normalize-space(), "Add an Existing Repository from your Local Drive") or contains(normalize-space(), "Add an Existing Repository from your local drive")]'
      )
      .first()
    const addRepositoryDialog = page.locator('dialog#add-existing-repository')

    await Promise.race([
      repoFile.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {}),
      addRepositoryDialog
        .waitFor({ state: 'visible', timeout: 15000 })
        .catch(() => {}),
      addButton.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {}),
    ])

    await failIfAppErrorDialogIsVisible(page)

    if (!(await repoFile.isVisible().catch(() => false))) {
      if (!(await addRepositoryDialog.isVisible().catch(() => false))) {
        await addButton.click()
      }

      await addRepositoryDialog.waitFor({ state: 'visible', timeout: 15000 })
      const pathInput = addRepositoryDialog.locator(
        'input[placeholder="repository path"]'
      )
      await pathInput.waitFor({ state: 'visible', timeout: 15000 })
      if ((await pathInput.inputValue()) !== smokeRepoPath) {
        await pathInput.fill(smokeRepoPath)
      }
      await addRepositoryDialog
        .locator(
          'button:has-text("Add Repository"), button:has-text("Add repository")'
        )
        .click()
    }

    await repoFile.waitFor({ state: 'visible', timeout: 15000 })
    await repoFile.click()

    // ── Diff ────────────────────────────────────────────────────────
    const diffContainer = page.locator('.diff-container')
    await diffContainer.waitFor({ state: 'visible', timeout: 15000 })
    await expect(diffContainer).toContainText(smokeRepoFileContents, {
      timeout: 15000,
    })

    // ── Commit ──────────────────────────────────────────────────────
    const commitButton = page.locator(
      '[aria-label="Create commit"] .commit-button'
    )
    await commitButton.waitFor({ state: 'visible', timeout: 15000 })
    await dismissMoveToApplicationsDialog(page)
    await commitButton.click()

    await expect
      .poll(() => getSmokeRepoHeadMessage(), { timeout: 15000 })
      .toBe(`Create ${smokeRepoFileName}`)
    await expect.poll(() => getSmokeRepoStatus(), { timeout: 15000 }).toBe('')

    // ── Create branch ───────────────────────────────────────────────
    const initialBranch = getSmokeRepoCurrentBranch()
    const smokeBranch = 'smoke-branch'

    await dismissMoveToApplicationsDialog(page)
    await page.locator('.branch-button button').click()

    const newBranchBtn = page.locator('.new-branch-button')
    await newBranchBtn.waitFor({ state: 'visible', timeout: 15000 })
    await newBranchBtn.click()

    const createBranchDialog = page.locator('#create-branch')
    await createBranchDialog.waitFor({ state: 'visible', timeout: 15000 })
    const branchNameInput = createBranchDialog.locator('input').first()
    await branchNameInput.evaluate((el, value) => {
      const input = el as HTMLInputElement
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value'
      )?.set?.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    }, smokeBranch)

    await createBranchDialog
      .locator(
        'button:has-text("Create Branch"), button:has-text("Create branch")'
      )
      .click()

    await expect
      .poll(() => getSmokeRepoCurrentBranch(), { timeout: 15000 })
      .toBe(smokeBranch)

    // ── Switch back ─────────────────────────────────────────────────
    await dismissMoveToApplicationsDialog(page)
    await page.locator('.branch-button button').click()

    await page
      .locator(
        `//div[contains(@class, "branches-list-item")]//div[contains(@class, "name") and normalize-space()="${initialBranch}"]`
      )
      .click()

    await expect
      .poll(() => getSmokeRepoCurrentBranch(), { timeout: 15000 })
      .toBe(initialBranch)
    await expect.poll(() => getSmokeRepoStatus(), { timeout: 15000 }).toBe('')
  })
})

// ── Auto-update tests ───────────────────────────────────────────────

test.describe('Auto-update', () => {
  test.skip(
    process.platform === 'win32' && !process.env.DESKTOP_E2E_APP_PATH,
    'Windows auto-update requires an installed Squirrel app, not a packaged app directory.'
  )

  test.describe('startup update check', () => {
    test('sends an update check to the mock server on launch', async ({
      mockServer,
    }) => {
      test.skip(
        !shouldAutoCheckForUpdatesOnLaunch,
        `Startup update checks are disabled for the ${releaseChannel} channel.`
      )

      await expect
        .poll(
          async () => {
            const reqs = await getMockRequests()
            return reqs.some(r => isMockUpdateRequest(r.url))
          },
          { timeout: 30000, intervals: [1000] }
        )
        .toBe(true)
    })

    test('does not show update banner when no update is available', async ({
      mainWindow: page,
    }) => {
      const banner = page.locator('#update-available')
      await expect(banner).not.toBeVisible()
    })
  })

  test.describe('About dialog', () => {
    test('shows the current version', async ({ mainWindow: page }) => {
      await page.evaluate(() => {
        require('electron').ipcRenderer.emit('menu-event', {}, 'show-about')
      })

      const aboutDialog = page.locator('#about')
      await aboutDialog.waitFor({ state: 'visible', timeout: 5000 })

      const versionText = await aboutDialog
        .locator('.selectable-text')
        .textContent()
      expect(versionText).toMatch(/Version \d+\.\d+\.\d+/)
    })

    test('shows up-to-date status after no-update check', async ({
      mainWindow: page,
    }) => {
      if (!shouldAutoCheckForUpdatesOnLaunch) {
        await clickCheckForUpdatesIfAvailable(page)
      }

      const updateStatus = page.locator('#about .update-status')
      await updateStatus.waitFor({ state: 'visible', timeout: 10000 })
      await expect
        .poll(
          async () => {
            return ((await updateStatus.textContent()) ?? '').toLowerCase()
          },
          { timeout: 15000, intervals: [1000] }
        )
        .toContain('you have the latest version')
    })

    test('closes the About dialog', async ({ mainWindow: page }) => {
      await page.locator('#about button[type="submit"]').click()
      await page.locator('#about').waitFor({ state: 'hidden', timeout: 5000 })
    })
  })

  test.describe('update available', () => {
    test('switches mock server to return an update', async ({}) => {
      await controlMockServer('reset-requests')
      await controlMockServer('set-behavior/update-available')
      const behavior = await controlMockServer('behavior')
      expect(behavior).toBe('update-available')
    })

    test('triggers an update check and the app processes it', async ({
      mainWindow: page,
    }) => {
      await page.evaluate(() => {
        require('electron').ipcRenderer.emit('menu-event', {}, 'show-about')
      })

      const aboutDialog = page.locator('#about')
      await aboutDialog.waitFor({ state: 'visible', timeout: 5000 })

      await clickCheckForUpdatesIfAvailable(aboutDialog)

      // Wait for status change
      const updateStatus = aboutDialog.locator('.update-status')
      await expect
        .poll(
          async () => {
            if (!(await updateStatus.isVisible().catch(() => false))) {
              return ''
            }
            return ((await updateStatus.textContent()) ?? '').toLowerCase()
          },
          { timeout: 15000, intervals: [1000] }
        )
        .toMatch(/checking|downloading|ready to be installed/)

      // Close dialog
      await page.locator('#about button[type="submit"]').click()
      await aboutDialog
        .waitFor({ state: 'hidden', timeout: 5000 })
        .catch(() => {})
    })

    test('sent update check requests to the mock server', async ({}) => {
      await expect
        .poll(
          async () => {
            const reqs = await getMockRequests()
            return reqs.filter(
              r => r.method === 'GET' && isMockUpdateRequest(r.url)
            ).length
          },
          { timeout: 15000, intervals: [1000] }
        )
        .toBeGreaterThanOrEqual(1)
    })

    test('shows installing-update warning when quitting during download', async ({
      mainWindow: page,
    }) => {
      await page.evaluate(() => {
        require('electron').ipcRenderer.emit('menu-event', {}, 'show-about')
      })

      const aboutDialog = page.locator('#about')
      await aboutDialog.waitFor({ state: 'visible', timeout: 5000 })

      await clickCheckForUpdatesIfAvailable(aboutDialog)

      const updateStatus = aboutDialog.locator('.update-status')
      await expect
        .poll(
          async () => {
            if (!(await updateStatus.isVisible().catch(() => false))) {
              return ''
            }

            return ((await updateStatus.textContent()) ?? '').toLowerCase()
          },
          { timeout: 15000, intervals: [1000] }
        )
        .toContain('downloading update')

      await page.locator('#about button[type="submit"]').click()
      await aboutDialog
        .waitFor({ state: 'hidden', timeout: 5000 })
        .catch(() => {})

      await page.evaluate(() => {
        require('electron').ipcRenderer.send('quit-app')
      })

      const dialog = page.locator('#installing-update')
      await dialog.waitFor({ state: 'visible', timeout: 5000 })

      await expect(dialog.locator('.updating-message')).toContainText(
        'Do not close GitHub Desktop while the update is in progress'
      )

      // Reset mock and trigger quit again to test Quit Anyway
      await controlMockServer('set-behavior/no-update')
      await controlMockServer('reset-requests')

      await page.evaluate(() => {
        require('electron').ipcRenderer.send('quit-app')
      })

      const quitBtn = dialog.locator(
        '.button-group.destructive button[type="button"]'
      )
      await quitBtn.waitFor({ state: 'visible', timeout: 5000 })

      // Save the trace now — the next click will kill the app and make
      // the browser context unavailable for the fixture teardown.
      const tracePath = require('path').join(
        __dirname,
        '..',
        '..',
        '..',
        'playwright-videos',
        `trace-${Date.now()}.zip`
      )
      await page
        .context()
        .tracing.stop({ path: tracePath })
        .catch(() => {})

      // Get PID before quitting so we can verify the process exits
      const rendererPid: number = await page.evaluate(() => process.pid)

      await quitBtn.click()

      // Poll the OS to confirm the renderer process exited
      await expect
        .poll(
          () => {
            try {
              process.kill(rendererPid, 0)
              return false
            } catch {
              return true
            }
          },
          { timeout: 10000, intervals: [200] }
        )
        .toBe(true)

      terminateWindowsUpdaterProcesses()
    })
  })
})
