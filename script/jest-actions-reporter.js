const { resolve, relative } = require('path')

/* eslint-disable @typescript-eslint/explicit-member-accessibility */
class JestActionsReporter {
  constructor(globalConfig, options) {
    this._globalConfig = globalConfig
    this._options = options
  }

  onRunComplete(contexts, results) {
    if (process.env.GITHUB_ACTIONS !== 'true') {
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

        for (const msg of failureMessages) {
          const { line, column } =
            tryGetFailureLocation(msg, testFilePath) || location

          const escapedMessage = `${msg}`.replace(/\r?\n/g, '%0A')
          process.stdout.write(
            `::error file=${path},line=${line},col=${column}::${escapedMessage}\n`
          )
        }
      }
    }
  }
}

function tryGetFailureLocation(message, testPath) {
  for (const line of message.split(/\r?\n/g)) {
    if (!/^\s+at\s/.test(line)) {
      continue
    }

    const ix = line.indexOf(testPath)

    if (ix < 0) {
      continue
    }

    const locationRe = /:(\d+):(\d+)/
    const remainder = line.substr(ix + testPath.length)
    const match = locationRe.exec(remainder)

    if (match) {
      return {
        line: parseInt(match[1], 10),
        column: parseInt(match[2], 10),
      }
    }
  }

  return undefined
}

module.exports = JestActionsReporter
