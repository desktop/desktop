import { ChildProcess } from 'child_process'
import { GitProgressParser, IGitProgress, IGitOutput } from './git'
import { IGitExecutionOptions } from '../git/core'
import { merge } from '../merge'

const byline = require('byline')

/**
 * Merges an instance of IGitExecutionOptions with a process callback provided
 * by progressProcessCallback.
 * 
 * If the given options object already has a processCallback specified it will
 * be overwritten.
 */
export function executionOptionsWithProgress(
  options: IGitExecutionOptions,
  parser: GitProgressParser,
  progressCallback: (progress: IGitProgress | IGitOutput) => void
): IGitExecutionOptions {
  return merge(options, {
    processCallback: progressProcessCallback(parser, progressCallback),
  })
}

/**
 * Returns a callback which can be passed along to the processCallback option
 * in IGitExecution. The callback then takes care of reading stderr of the
 * process and parsing its contents using the provided parser.
 */
export function progressProcessCallback(
  parser: GitProgressParser,
  progressCallback: (progress: IGitProgress | IGitOutput) => void
): (process: ChildProcess) => void {
  return process => {
    byline(process.stderr).on('data', (line: string) => {
      progressCallback(parser.parse(line))
    })
  }
}
