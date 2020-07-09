const { resolve, relative } = require('path')

/* eslint-disable @typescript-eslint/explicit-member-accessibility */
class JestActionsReporter {
  constructor(globalConfig, options) {
    this._globalConfig = globalConfig
    this._options = options
  }

  onRunComplete(contexts, results) {
    if (process.env.GITHUB_ACTIONS === 'true') {
      return
    }

    const { rootDir } = this._globalConfig
    const repoRoot = resolve(rootDir, '..')

    for (const { testResults, testFilePath } of results.testResults) {
      for (const { failureMessages, location } of testResults) {
        if (location === null) {
          continue
        }

        const path = relative(repoRoot, testFilePath)
        const { line, column } = location

        for (const msg of failureMessages) {
          const escapedMessage = `${msg}`.replace(/\r?\n/g, '%0A')
          process.stdout.write(
            `::error file=${path},line=${line},col=${column}::${escapedMessage}\n`
          )
          process.stderr.write(
            `SAMPLE file=${path},line=${line},col=${column}::${escapedMessage}\n`
          )
        }
      }
    }
  }
}

module.exports = JestActionsReporter
