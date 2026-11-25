import { spawn } from 'child_process'
import { join, resolve } from 'path'
import { readdir, readFile, stat } from 'fs/promises'
import { parseEnv } from 'util'
import { availableParallelism } from 'os'

function reporter(r) {
  return ['--test-reporter', r, '--test-reporter-destination', 'stdout']
}

async function findTestFilesIn(paths) {
  const files = []
  for (const path of paths) {
    const entry = await stat(path)
    if (entry.isFile()) {
      files.push(path)
      continue
    }

    for (const file of await readdir(path, { recursive: true }).then(x =>
      x
        .filter(f => /-test\.(ts|tsx|js|jsx|mts|mjs)$/.test(f))
        .map(f => join(path, f))
    )) {
      files.push(file)
    }
  }
  return files
}

const fileArgs = process.argv.slice(2).filter(a => !a.startsWith('--'))
const switchArgs = process.argv.slice(2).filter(a => a.startsWith('--'))

const projectRoot = join(import.meta.dirname, '..')
const files =
  fileArgs.length > 0
    ? await findTestFilesIn(fileArgs)
    : await findTestFilesIn([join(projectRoot, 'app', 'test', 'unit')])

// I would _looooove_ to use the `--env-file` option, but it doesn't override
// existing environment variables and we need to override some of them.
const testEnv = parseEnv(await readFile(join(projectRoot, '.test.env'), 'utf8'))
Object.entries(testEnv).forEach(([k, v]) => (process.env[k] = v))

const baseArgs = [
  '--disable-warning=ExperimentalWarning',
  '--experimental-test-module-mocks',
  // Allow CJS resolution to find ESM-only packages (e.g. @github/copilot-sdk)
  // whose "exports" only declare an "import" condition with no "require" fallback.
  '--conditions=import',
  ...['--import', 'tsx'],
  ...['--import', './app/test/globals.mts'],
  ...switchArgs,
]

const args = [
  ...baseArgs,
  '--test',
  ...reporter('spec'),
  ...(process.env.GITHUB_ACTIONS ? reporter('node-test-github-reporter') : []),
  ...files,
]

const cwd = resolve(import.meta.dirname, '..')

if (process.env.DESKTOP_TEST_PER_FILE) {
  await runPerFile()
} else {
  spawn('node', args, { stdio: 'inherit', cwd }).on('exit', process.exit)
}

/**
 * DEBUG: run each test file in its own process, logging start/end, a periodic
 * heartbeat of running files, and killing (with partial output) any file that
 * exceeds the per-file timeout.
 */
async function runPerFile() {
  const fileTimeoutMs = Number(
    process.env.DESKTOP_TEST_FILE_TIMEOUT_MS ?? 10 * 60 * 1000
  )
  const testTimeoutMs = Number(
    process.env.DESKTOP_TEST_TIMEOUT_MS ?? 6 * 60 * 1000
  )
  const concurrency = Math.max(1, availableParallelism() - 1)
  const queue = [...files]
  const running = new Map()
  const results = []
  const t0 = Date.now()
  const elapsed = since => `${((Date.now() - since) / 1000).toFixed(1)}s`
  const log = message => console.log(`[per-file +${elapsed(t0)}] ${message}`)

  log(`${files.length} files, concurrency ${concurrency}`)

  const heartbeat = setInterval(() => {
    const list = [...running.entries()]
      .map(([file, started]) => `${file} (${elapsed(started)})`)
      .join(', ')
    log(`running ${running.size}, queued ${queue.length}: ${list}`)
  }, 60 * 1000)

  const runOne = file =>
    new Promise(resolvePromise => {
      const started = Date.now()
      running.set(file, started)
      log(`START ${file}`)
      const child = spawn(
        process.execPath,
        [
          ...baseArgs,
          `--test-timeout=${testTimeoutMs}`,
          '--test',
          ...reporter('spec'),
          file,
        ],
        { cwd, stdio: ['ignore', 'pipe', 'pipe'] }
      )
      let output = ''
      child.stdout.on('data', d => (output += d))
      child.stderr.on('data', d => (output += d))
      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        log(`TIMEOUT ${file} after ${elapsed(started)}; partial output:`)
        console.log(output)
        log(`END PARTIAL OUTPUT ${file}`)
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'])
        } else {
          child.kill('SIGKILL')
        }
      }, fileTimeoutMs)
      child.on('exit', code => {
        clearTimeout(timer)
        running.delete(file)
        const duration = (Date.now() - started) / 1000
        results.push({ file, code, duration, timedOut })
        log(`END ${file} code=${code} ${duration.toFixed(1)}s`)
        if (code !== 0 && !timedOut) {
          console.log(output)
        }
        resolvePromise()
      })
    })

  const worker = async () => {
    while (queue.length > 0) {
      await runOne(queue.shift())
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
  clearInterval(heartbeat)

  const slowest = [...results].sort((a, b) => b.duration - a.duration)
  log('slowest files:')
  for (const r of slowest.slice(0, 25)) {
    console.log(`  ${r.duration.toFixed(1)}s ${r.file}`)
  }
  const bad = results.filter(r => r.code !== 0 || r.timedOut)
  for (const r of bad) {
    log(`${r.timedOut ? 'TIMED OUT' : 'FAILED'} ${r.file} code=${r.code}`)
  }
  process.exit(bad.length > 0 ? 1 : 0)
}
