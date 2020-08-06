import { ChildProcess } from 'child_process'
import * as Fs from 'fs'
import * as Path from 'path'
import byline from 'byline'

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
    let lfsProgressActive = false

    if (lfsProgressPath) {
      const lfsParser = new GitLFSProgressParser()
      const disposable = tailByLine(lfsProgressPath, line => {
        const progress = lfsParser.parse(line)

        if (progress.kind === 'progress') {
          lfsProgressActive = true
          progressCallback(progress)
        }
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

    // If Node.js encounters a synchronous runtime error while spawning
    // `stderr` will be undefined and the error will be emitted asynchronously
    if (process.stderr) {
      byline(process.stderr).on('data', (line: string) => {
        const progress = parser.parse(line)

        if (lfsProgressActive) {
          // While we're sending LFS progress we don't want to mix
          // any non-progress events in with the output or we'll get
          // flickering between the indeterminate LFS progress and
          // the regular progress.
          if (progress.kind === 'context') {
            return
          }

          const { title, done } = progress.details

          // The 'Filtering content' title happens while the LFS
          // filter is running and when it's done we know that the
          // filter is done but until then we don't want to display
          // it for the same reason that we don't want to display
          // the context above.
          if (title === 'Filtering content') {
            if (done) {
              lfsProgressActive = false
            }
            return
          }
        }

        progressCallback(progress)
      })
    }
  }
}
