import { git, IGitExecutionOptions, gitNetworkArguments } from './core'
import { ICloneProgress } from '../app-state'
import { CloneProgressParser, executionOptionsWithProgress } from '../progress'
import { envForAuthentication, IGitAccount } from './authentication'

import * as Fs from 'fs-extra'
import * as Path from 'path'
import * as Os from 'os'
import { uuid } from '../uuid'

import { pathExists } from '../file-system'
import { getUserDataPath } from '../../ui/lib/app-proxy'

/** Additional arguments to provide when cloning a repository */
export type CloneOptions = {
  /** The optional identity to provide when cloning. */
  readonly account: IGitAccount | null
  /** The branch to checkout after the clone has completed. */
  readonly branch?: string
}

function getLogFilePath(action: string): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const day = now.getDate()
  const fileName = `${year}-${month}-${day}-desktop.${action}.${uuid()}.log`
  // TODO: probably a better pattern for generating this file path
  return Path.join(Os.tmpdir(), fileName)
}

async function moveTracingToLogDirectory(logFile: string): Promise<void> {
  const exists = await pathExists(logFile)
  if (exists) {
    return new Promise<void>((resolve, reject) => {
      const userData = getUserDataPath()
      const logsDir = Path.join(userData, 'logs')
      Fs.move(logFile, logsDir, err => {
        if (err) {
          log.debug('Unable to move tracing file to logs directory', err)
        }
        resolve()
      })
    })
  }
}

async function moveLFSTraceFilesToLogDirectory(
  directory: string
): Promise<void> {
  // TODO: scan directory for LFS log files
  // TODO: copy any files to log directory
  await Promise.resolve()
}

async function cleanupTracing(logFile: string): Promise<void> {
  const exists = await pathExists(logFile)
  if (exists) {
    return new Promise<void>((resolve, reject) => {
      Fs.unlink(logFile, err => {
        if (err) {
          log.debug('Unable to move tracing file to log directory', err)
        }
      })
      resolve()
    })
  }
}

/**
 * Clones a repository from a given url into to the specified path.
 *
 * @param url     - The remote repository URL to clone from
 *
 * @param path    - The destination path for the cloned repository. If the
 *                  path does not exist it will be created. Cloning into an
 *                  existing directory is only allowed if the directory is
 *                  empty.
 *
 * @param options  - Options specific to the clone operation, see the
 *                   documentation for CloneOptions for more details.
 *
 * @param progressCallback - An optional function which will be invoked
 *                           with information about the current progress
 *                           of the clone operation. When provided this enables
 *                           the '--progress' command line flag for
 *                           'git clone'.
 *
 */
export async function clone(
  url: string,
  path: string,
  options: CloneOptions,
  progressCallback?: (progress: ICloneProgress) => void
): Promise<void> {
  const logFile = getLogFilePath('clone')
  const env = envForAuthentication(options.account, { logFile })

  const args = [
    ...gitNetworkArguments,
    'lfs',
    'clone',
    '--recursive',
    '--progress',
    // git-lfs will create the hooks it requires by default
    // and we don't know if the repository is LFS enabled
    // at this stage so let's not do this
    '--skip-repo',
  ]

  let opts: IGitExecutionOptions = { env }

  if (progressCallback) {
    args.push('--progress')

    const title = `Cloning into ${path}`
    const kind = 'clone'

    opts = executionOptionsWithProgress(
      opts,
      new CloneProgressParser(),
      progress => {
        const description =
          progress.kind === 'progress' ? progress.details.text : progress.text
        const value = progress.percent

        progressCallback({ kind, title, description, value })
      }
    )

    // Initial progress
    progressCallback({ kind, title, value: 0 })
  }

  if (options.branch) {
    args.push('-b', options.branch)
  }

  args.push('--', url, path)

  try {
    await git(args, __dirname, 'clone', opts)
  } catch (e) {
    await moveTracingToLogDirectory(logFile)
    await moveLFSTraceFilesToLogDirectory(path)
    throw e
  }

  await cleanupTracing(logFile)
}
