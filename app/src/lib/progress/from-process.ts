import { ChildProcess } from 'child_process'
import * as Fs from 'fs'
import * as byline from 'byline'

import { GitProgressParser, IGitProgress, IGitOutput } from './git'
import { IGitExecutionOptions } from '../git/core'
import { merge } from '../merge'
import { GitLFSProgressParser, createLFSProgressFile } from './lfs'
import { tailByLine } from '../file-system'

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
  let lfsProgressPath = null
  let env = {}
  if (options.trackLFSProgress) {
    try {
      lfsProgressPath = await createLFSProgressFile()
      env = { GIT_LFS_PROGRESS: lfsProgressPath }
    } catch (e) {
      log.error('Error writing LFS progress file', e)
      env = { GIT_LFS_PROGRESS: null }
    }
  }

  return merge(options, {
    processCallback: createProgressProcessCallback(
      parser,
      lfsProgressPath,
      progressCallback
    ),
    env: merge(options.env, env),
  })
}

/**
 * Returns a callback which can be passed along to the processCallback option
 * in IGitExecution. The callback then takes care of reading stderr of the
 * process and parsing its contents using the provided parser.
 */
function createProgressProcessCallback(
  parser: GitProgressParser,
  lfsProgressPath: string | null,
  progressCallback: (progress: IGitProgress | IGitOutput) => void
): (process: ChildProcess) => void {
  return process => {
    if (lfsProgressPath) {
      const lfsParser = new GitLFSProgressParser()
      const disposable = tailByLine(lfsProgressPath, line => {
        const progress = lfsParser.parse(line)
        progressCallback(progress)
      })

      process.on('close', () => {
        disposable.dispose()
        // NB: We don't really care about errors deleting the file, but Node
        // gets kinda bothered if we don't provide a callback.
        Fs.unlink(lfsProgressPath, () => {})
      })
    }

    byline(process.stderr).on('data', (line: string) => {
      progressCallback(parser.parse(line))
    })
  }
}
