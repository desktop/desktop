import { spawn } from 'child_process'
import { join, resolve, sep } from 'path'
import { readFile } from 'fs/promises'
import { parseEnv } from 'util'
import { findTestFilesIn } from './find-test-files.mjs'
import { checkScope } from './type-check.mjs'

/** @param {string} r */
function reporter(r) {
  return ['--test-reporter', r, '--test-reporter-destination', 'stdout']
}

const fileArgs = process.argv.slice(2).filter(a => !a.startsWith('--'))
const switchArgs = process.argv.slice(2).filter(a => a.startsWith('--'))

const projectRoot = join(import.meta.dirname, '..')
const files =
  fileArgs.length > 0
    ? await findTestFilesIn(fileArgs)
    : await findTestFilesIn([join(projectRoot, 'app', 'test', 'unit')])

if (files.length === 0) {
  throw new Error('No test files found')
}

await checkScope('scripts')
const scopes = new Set(
  files.map(file =>
    resolve(file).startsWith(join(projectRoot, 'eslint-rules') + sep)
      ? 'eslint'
      : resolve(file).startsWith(join(projectRoot, 'script') + sep)
        ? 'scripts'
        : 'app'
  )
)
for (const scope of scopes) {
  if (scope !== 'scripts') {
    await checkScope(scope)
  }
}

// I would _looooove_ to use the `--env-file` option, but it doesn't override
// existing environment variables and we need to override some of them.
const testEnv = parseEnv(await readFile(join(projectRoot, '.test.env'), 'utf8'))
Object.entries(testEnv).forEach(([k, v]) => (process.env[k] = v))

const args = [
  '--disable-warning=ExperimentalWarning',
  '--experimental-test-module-mocks',
  // Allow CJS resolution to find ESM-only packages (e.g. @github/copilot-sdk)
  // whose "exports" only declare an "import" condition with no "require" fallback.
  '--conditions=import',
  ...['--import', 'tsx'],
  ...['--import', './app/test/globals.mts'],
  ...switchArgs,
  '--test',
  ...reporter('spec'),
  ...(process.env.GITHUB_ACTIONS ? reporter('node-test-github-reporter') : []),
  ...files,
]

const child = spawn(process.execPath, args, {
  stdio: 'inherit',
  cwd: resolve(import.meta.dirname, '..'),
})
child.on('error', error => {
  console.error(error)
  process.exitCode = 1
})
child.on('exit', (code, signal) => {
  if (signal !== null) {
    console.error(`Test process terminated by ${signal}`)
  }
  process.exitCode = code ?? 1
})
