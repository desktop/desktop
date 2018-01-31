/// <reference path="../globals.d.ts" />

import { run } from './run'

if (!process.env.GITHUB_ACCESS_TOKEN) {
  console.log('You need to provide a GITHUB_ACCESS_TOKEN environment variable')
  process.exit(1)
}

process.on('unhandledRejection', error => {
  console.error(error.message)
})

const args = process.argv.splice(2)
run(args)
