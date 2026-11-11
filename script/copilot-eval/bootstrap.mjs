import { Console } from 'node:console'
import { readFile } from 'node:fs/promises'

const pkg = JSON.parse(
  await readFile(new URL('../../app/package.json', import.meta.url), 'utf8')
)
const logger = new Console({ stdout: process.stderr, stderr: process.stderr })

Object.assign(globalThis, {
  __DEV__: false,
  __TEST__: false,
  __DEV_SECRETS__: false,
  __APP_NAME__: pkg.productName,
  __APP_VERSION__: pkg.version,
  __RELEASE_CHANNEL__: 'development',
  __UPDATES_URL__: '',
  __SHA__: 'evaluation',
  __DARWIN__: process.platform === 'darwin',
  __WIN32__: process.platform === 'win32',
  __LINUX__: process.platform === 'linux',
  log: logger,
})
