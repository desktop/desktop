/// <reference path="../globals.d.ts" />

import { run } from './run'

process.on('unhandledRejection', error => {
  console.error(error.message)
})

const args = process.argv.splice(2)
run(args)
