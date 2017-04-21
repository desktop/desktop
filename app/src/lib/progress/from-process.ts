import { ChildProcess } from 'child_process'
import { GitProgressParser, ICombinedProgress, IContextOutput } from './git'
import { IGitExecutionOptions } from '../git/core'
import { merge } from '../merge'

const byline = require('byline')

export function executionOptionsWithProgress(
  options: IGitExecutionOptions,
  parser: GitProgressParser,
  progressCallback: (progress: ICombinedProgress | IContextOutput) => void): IGitExecutionOptions {

  return merge(options, {
    processCallback: progressProcessCallback(parser, progressCallback)
  })
}

export function progressProcessCallback(
  parser: GitProgressParser,
  progressCallback: (progress: ICombinedProgress | IContextOutput) => void): (process: ChildProcess) => void {

  return (process) => {
    byline(process.stderr).on('data', (line: string) => {
      progressCallback(parser.parse(line))
    })
  }
}
