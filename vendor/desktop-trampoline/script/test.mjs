import { spawn } from 'child_process'
import { join } from 'path'
import { readdir } from 'fs/promises'

/** @param {string} r */
function reporter(r) {
  return ['--test-reporter', r, '--test-reporter-destination', 'stdout']
}

const files = await readdir('test', { recursive: true }).then(x =>
  x.filter(f => f.endsWith('-test.ts')).map(f => join('test', f))
)

const args = [
  '--no-experimental-strip-types',
  ...['--import', 'tsx'],
  '--test',
  ...reporter('spec'),
  ...(process.env.GITHUB_ACTIONS ? reporter('node-test-github-reporter') : []),
  ...files,
]

spawn(process.execPath, args, { stdio: 'inherit' })
  .on('error', error => {
    console.error(error)
    process.exitCode = 1
  })
  .on('exit', (code, signal) => {
    process.exitCode = code ?? 1
    if (signal !== null) {
      process.kill(process.pid, signal)
    }
  })
