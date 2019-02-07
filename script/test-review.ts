/* eslint-disable no-sync */

import * as fs from 'fs'
import { getLogFiles } from '../app/test/helpers/logs'

console.log(`Reviewing test failures`)

getLogFiles().then(files =>
  files.forEach(file => {
    console.log(`opening ${file}:`)
    const text = fs.readFileSync(file, 'utf-8')
    console.log(text)
  })
)
