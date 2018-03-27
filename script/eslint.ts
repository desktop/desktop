#!/usr/bin/env ts-node

import * as Path from 'path'
import chalk from 'chalk'

const { CLIEngine } = require('eslint')

const shouldFix = process.argv.indexOf('--fix') > -1
const eslint = new CLIEngine({
  cache: true,
  cwd: Path.dirname(__dirname),
  fix: shouldFix,
  rulePaths: [Path.join(__dirname, '..', 'eslint-rules')],
})

const report = eslint.executeOnFiles([
  './{script,eslint-rules}/**/*.{j,t}s?(x)',
  './tslint-rules/**/*.ts',
  './app/*.js',
  './app/{src,typings,test}/**/*.{j,t}s?(x)',
  './changelog.json',
])

if (shouldFix) {
  CLIEngine.outputFixes(report)
}

console.log(eslint.getFormatter()(report.results))

if (report.errorCount > 0) {
  process.exitCode = 1
  console.error(
    chalk`{bold.green → To fix some of these errors, run {underline yarn eslint --fix}}`
  )
}
