import { ChildProcess } from 'child_process'
import * as Fs from 'fs'
import * as Path from 'path'
import * as byline from 'byline'

import { IGitProgress, IGitOutput, IGitProgressParser } from './git'
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
  parser: IGitProgressParser,
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
  parser: IGitProgressParser,
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
        // the order of these callbacks is important because
        //  - unlink can only be done on files
        //  - rmdir can only be done when the directory is empty
        //  - we don't want to surface errors to the user if something goes
        //    wrong (these files can stay in TEMP and be cleaned up eventually)
        Fs.unlink(lfsProgressPath, err => {
          if (err == null) {
            const directory = Path.dirname(lfsProgressPath)
            Fs.rmdir(directory, () => {})
          }
        })
      })
    }

    byline(process.stderr).on('data', (line: string) => {
      progressCallback(parser.parse(line))
    })
  }
}
