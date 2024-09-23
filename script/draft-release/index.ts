/// <reference path="../globals.d.ts" />

import { execSync } from 'child_process'
import { run } from './run'

try {
  execSync('gh auth status -h github.com')
} catch (e) {
  console.error('You need to authenticate with GitHub CLI')
  console.error(
    'Make sure you have GitHub CLI installed (https://github.com/cli/cli?tab=readme-ov-file#installation) and run `gh auth login`'
  )
  console.error('Check https://cli.github.com/ for more info')

  process.exit(1)
}

process.on('unhandledRejection', error => {
  console.error(error.message)
})

const args = process.argv.splice(2)
run(args)
