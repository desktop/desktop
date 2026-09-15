/* eslint-disable no-sync */

/**
 * Shared Playwright fixtures for GitHub Desktop e2e tests.
 *
 * Provides:
 *  - `app`  — the ElectronApplication instance
 *  - `mainWindow` — the main BrowserWindow page
 *  - `mockServer` — the mock update server (with control helpers)
 *
 * All fixtures are scoped to the **worker** so the app launches once
 * and all tests in the file share the same session (one Electron
 * session runs all specs sequentially).
 */

import fs from 'fs'
import http from 'http'
import os from 'os'
import path from 'path'
import { spawnSync } from 'child_process'
import {
  test as base,
  type ElectronApplication,
  type Page,
} from '@playwright/test'
import { _electron as electron } from 'playwright'
import { ensureSmokeTestRepository, smokeRepoPath } from './test-helpers'
import {
  createMockUpdateServer,
  MOCK_CONTROL_URL,
  type IMockUpdateServer,
  type UpdateBehavior,
} from './mock-update-server'
import { getDistPath, getExecutableName } from '../../../script/dist-info'
import { getProductName } from '../../package-info'

const projectRoot = path.resolve(__dirname, '..', '..', '..')
const userDataDir = path.join(os.tmpdir(), 'github-desktop-pw-e2e')
const fakeHomeDir = path.join(os.tmpdir(), 'github-desktop-pw-fake-home')
const installedAppExecutablePath = process.env.DESKTOP_E2E_APP_PATH
// `packaged` is the default because CI runs the suite against packaged or
// installed production artifacts. `unpackaged` exists for local iteration so
// the same tests can run against the staged app in `out/main.js` without
// requiring packaging or signing.
const e2eAppMode = process.env.DESKTOP_E2E_APP_MODE ?? 'packaged'
const unpackagedAppEntryPoint = path.join(projectRoot, 'out', 'main.js')

function getPackagedAppExecutablePath() {
  const distPath = getDistPath()

  if (process.platform === 'darwin') {
    const productName = getProductName()
    return path.join(
      distPath,
      `${productName}.app`,
      'Contents',
      'MacOS',
      productName
    )
  }

  if (process.platform === 'win32') {
    return path.join(distPath, `${getExecutableName()}.exe`)
  }

  return path.join(distPath, getExecutableName())
}

const e2eAppExecutablePath =
  installedAppExecutablePath ?? getPackagedAppExecutablePath()

function getE2ELaunchOptions() {
  if (installedAppExecutablePath !== undefined) {
    return {
      executablePath: installedAppExecutablePath,
      args: [`--user-data-dir=${userDataDir}`, `--cli-open=${smokeRepoPath}`],
      missingPath: installedAppExecutablePath,
    }
  }

  if (e2eAppMode === 'unpackaged') {
    return {
      args: [
        unpackagedAppEntryPoint,
        `--user-data-dir=${userDataDir}`,
        `--cli-open=${smokeRepoPath}`,
      ],
      missingPath: unpackagedAppEntryPoint,
    }
  }

  return {
    executablePath: e2eAppExecutablePath,
    args: [`--user-data-dir=${userDataDir}`, `--cli-open=${smokeRepoPath}`],
    missingPath: e2eAppExecutablePath,
  }
}

export function terminateWindowsUpdaterProcesses() {
  if (process.platform !== 'win32') {
    return
  }

  for (const imageName of ['Update.exe', 'GitHubDesktop.exe']) {
    spawnSync('taskkill', ['/F', '/T', '/IM', imageName], {
      stdio: 'ignore',
      windowsHide: true,
    })
  }
}

// ── Helpers exposed to tests ────────────────────────────────────────

type MockControlAction =
  | `set-behavior/${UpdateBehavior}`
  | 'reset-requests'
  | 'requests'
  | 'behavior'

export function controlMockServer(action: MockControlAction): Promise<string> {
  return new Promise((resolve, reject) => {
    http
      .get(`${MOCK_CONTROL_URL}/${action}`, res => {
        let data = ''
        res.on('data', (chunk: string) => (data += chunk))
        res.on('end', () => resolve(data))
      })
      .on('error', reject)
  })
}

export async function getMockRequests(): Promise<
  ReadonlyArray<{ method: string; url: string }>
> {
  return JSON.parse(await controlMockServer('requests'))
}

export async function dismissMoveToApplicationsDialog(page: Page) {
  if (process.platform !== 'darwin') {
    return
  }

  const btn = page.locator(
    'button:has-text("Not Now"), button:has-text("Not now")'
  )
  if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await btn.click()
    await btn.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {})
  }
}

// ── Fixtures ────────────────────────────────────────────────────────

type E2EFixtures = {
  app: ElectronApplication
  mainWindow: Page
  mockServer: IMockUpdateServer
}

export const test = base.extend<{}, E2EFixtures>({
  // Worker-scoped: one Electron app per test file.
  // Depends on mockServer so the update server is ready before launch.
  app: [
    async ({ mockServer }, use) => {
      // Setup directories
      ensureSmokeTestRepository()

      const launchOptions = getE2ELaunchOptions()

      if (!fs.existsSync(launchOptions.missingPath)) {
        throw new Error(
          `E2E app not found at ${launchOptions.missingPath}. Run the matching E2E build step first.`
        )
      }

      fs.rmSync(userDataDir, { recursive: true, force: true })
      fs.mkdirSync(userDataDir, { recursive: true })
      fs.rmSync(fakeHomeDir, { recursive: true, force: true })
      fs.mkdirSync(fakeHomeDir, { recursive: true })

      const app = await electron.launch({
        ...launchOptions,
        env: {
          ...process.env,
          GIT_CONFIG_GLOBAL: path.join(fakeHomeDir, '.gitconfig'),
          GIT_CONFIG_SYSTEM: path.join(fakeHomeDir, '.gitconfig-system'),
          XDG_CONFIG_HOME: path.join(fakeHomeDir, '.config'),
          SSH_AUTH_SOCK: '',
          GIT_SSH_COMMAND: 'false',
        },
        recordVideo: {
          dir: path.join(projectRoot, 'playwright-videos'),
          size: { width: 1280, height: 800 },
        },
        timeout: 30000,
      })

      await use(app)

      terminateWindowsUpdaterProcesses()
      await app.close().catch(() => {})
      terminateWindowsUpdaterProcesses()
      await new Promise(resolve => setTimeout(resolve, 1000))
    },
    { scope: 'worker' },
  ],

  mainWindow: [
    async ({ app }, use) => {
      const page = await app.firstWindow()

      page.on('console', message => {
        const text = message.text()
        if (message.type() === 'error' || text.includes('Uncaught exception')) {
          console.log(`[e2e:console:${message.type()}] ${text}`)
        }
      })

      page.on('pageerror', error => {
        const details = error.stack ?? error.message
        console.log(`[e2e:pageerror] ${details}`)
      })

      // Start tracing for this worker session
      await page.context().tracing.start({
        screenshots: true,
        snapshots: true,
      })

      await use(page)

      // Save trace on teardown
      const tracePath = path.join(
        projectRoot,
        'playwright-videos',
        `trace-${Date.now()}.zip`
      )
      await page
        .context()
        .tracing.stop({ path: tracePath })
        .catch(() => {})
    },
    { scope: 'worker' },
  ],

  mockServer: [
    async ({}, use) => {
      const server = await createMockUpdateServer()
      await use(server)
      await server.close()
    },
    { scope: 'worker' },
  ],
})

export { expect } from '@playwright/test'
