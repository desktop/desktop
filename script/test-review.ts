/* eslint-disable no-sync */

import * as fs from 'fs'
import { getLogFiles } from './review-logs'

function reviewLogs() {
  getLogFiles().forEach(file => {
    console.log(`opening ${file}:`)
    const text = fs.readFileSync(file, 'utf-8')
    console.log(text)
  })
}

if (process.platform === 'darwin') {
  reviewLogs()
}

if (process.platform === 'win32') {
  if (process.env.APPVEYOR_TEST_RESULT !== '0') {
    reviewLogs()
  }
}
