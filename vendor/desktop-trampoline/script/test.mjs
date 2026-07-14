import { spawn } from 'child_process'
import { join } from 'path'
import { readdir } from 'fs/promises'

function reporter(r) {
  return ['--test-reporter', r, '--test-reporter-destination', 'stdout']
}

const files = await readdir('test', { recursive: true }).then(x =>
  x.filter(f => f.endsWith('-test.ts')).map(f => join('test', f))
)

const args = [
  ...['--import', 'tsx'],
  '--test',
  ...reporter('spec'),
  ...(process.env.GITHUB_ACTIONS ? reporter('node-test-github-reporter') : []),
  ...files,
]

spawn('node', args, { stdio: 'inherit' }).on('exit', process.exit)
