import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { TestContext } from 'node:test'
import { sleep } from '../../src/lib/promise'
import { isErrnoException } from '../../src/lib/errno-exception'

const isBusyError = (e: unknown) => isErrnoException(e) && e.code === 'EBUSY'

// Reimplementation of retry logic in rimraf:
// https://github.com/isaacs/rimraf/blob/8733d4c30078a1ae5f18bb6affe83c1eea0259b4/src/retry-busy.ts#L10
const clean = async (path: string, n = 1): Promise<void> =>
  rm(path, { recursive: true }).catch((e: unknown) =>
    n <= 6 && isBusyError(e)
      ? sleep(Math.ceil(Math.pow(n, 1.2))).then(() => clean(path, n + 1))
      : Promise.reject(e)
  )

export const createTempDirectory = (t: TestContext) =>
  mkdtemp(join(tmpdir(), 'desktop-test-')).then(path => {
    t.after(() => clean(path))
    return path
  })
