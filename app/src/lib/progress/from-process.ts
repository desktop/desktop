import { ChildProcess } from 'child_process'
import * as byline from 'byline'

import { GitProgressParser, IGitProgress, IGitOutput } from './git'
import { IGitExecutionOptions } from '../git/core'
import { merge } from '../merge'
import { GitLFSProgressParser } from './lfs'

/**
 * Merges an instance of IGitExecutionOptions with a process callback provided
 * by createProgressProcessCallback.
 *
 * If the given options object already has a processCallback specified it will
 * be overwritten.
 */
export async function executionOptionsWithProgress(
  options: IGitExecutionOptions,
  parser: GitProgressParser,
  progressCallback: (progress: IGitProgress | IGitOutput) => void
): Promise<IGitExecutionOptions> {

  return merge(options, {
    processCallback: createProgressProcessCallback(
      parser,
      options.trackLFSProgress ? options.trackLFSProgress : null,
      progressCallback
    ),
    env: options.env
  })
}

/**
 * Returns a callback which can be passed along to the processCallback option
 * in IGitExecution. The callback then takes care of reading stderr of the
 * process and parsing its contents using the provided parser.
 */
function createProgressProcessCallback(
  parser: GitProgressParser,
  lfsProgressPath: boolean | null,
  progressCallback: (progress: IGitProgress | IGitOutput) => void
): (process: ChildProcess) => void {
  return process => {
    const lfsParser = lfsProgressPath ? new GitLFSProgressParser() : null
    // If Node.js encounters a synchronous runtime error while spawning
    // `stderr` will be undefined and the error will be emitted asynchronously
    if (process.stderr) {
      byline(process.stderr).on('data', (line: string) => {
        progressCallback(lfsParser ? lfsParser.parse(line) : parser.parse(line))
      })
    }
  }
}
