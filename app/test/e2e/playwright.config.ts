/* eslint-disable no-sync */

import path from 'path'
import { defineConfig } from '@playwright/test'

const projectRoot = path.resolve(__dirname, '..', '..', '..')

// eslint-disable-next-line no-restricted-syntax
export default defineConfig({
  testDir: __dirname,
  testMatch: '*.e2e.ts',
  timeout: 120_000,
  retries: 0,
  workers: 1,

  outputDir: path.join(projectRoot, 'playwright-videos'),

  // Video recording and tracing are configured in the Electron-
  // specific fixtures (see e2e-fixtures.ts) rather than here,
  // because @playwright/test `use.video` / `use.trace` only apply
  // to browser contexts, not Electron apps.
})
