import * as Fs from 'fs-extra'
import * as Path from 'path'
import * as Os from 'os'
import { uuid } from '../uuid'

import { pathExists } from '../file-system'
import { getUserDataPath } from '../../ui/lib/app-proxy'
import { IGitResult } from './core'

function padNumber(n: number): string {
  return n.toString().padStart(2, '0')
}

/**
 * Get the path to a unique log file in the temporary directory for the machine.
 *
 * @param action the Git action to use in the file name
 */
export function getLogFilePath(action: string): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = padNumber(now.getMonth() + 1)
  const day = padNumber(now.getDate())
  const fileName = `${year}-${month}-${day}-desktop.${action}.${uuid()}.log`
  return Path.join(Os.tmpdir(), fileName)
}

function getLogsDir(): string {
  const userData = getUserDataPath()
  return Path.join(userData, 'logs')
}

async function moveTracingToLogDirectory(logFile: string): Promise<void> {
  const exists = await pathExists(logFile)
  if (!exists) {
    return
  }

  return new Promise<void>((resolve, reject) => {
    const fileName = Path.basename(logFile)
    const logsDir = getLogsDir()
    const destination = Path.join(logsDir, fileName)
    Fs.move(logFile, destination, { clobber: true }, err => {
      if (err) {
        log.debug('Unable to move tracing file to logs directory', err)
      }
      resolve()
    })
  })
}

async function copyLFSTraceFilesToLogDirectory(
  directory: string
): Promise<void> {
  const lfsLogsDir = Path.join(directory, '.git', 'lfs', 'objects', 'logs')

  const exists = await pathExists(lfsLogsDir)
  if (!exists) {
    return
  }

  return new Promise<void>((resolve, reject) => {
    Fs.readdir(lfsLogsDir, (err, files) => {
      if (err) {
        log.debug('unable to read files under LFS logs directory', err)
        resolve()
      }
      const logsDir = getLogsDir()

      for (const file of files) {
        const fullPath = Path.join(lfsLogsDir, file)
        const destination = Path.join(logsDir, file)

        Fs.copy(
          fullPath,
          destination,
          { clobber: true, overwrite: true },
          err => {
            if (err) {
              log.debug(
                `unable to copy file under LFS logs directory: ${fullPath}`,
                err
              )
            }
          }
        )
      }
    })
  })
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
 * Execute a Git operation with error handling to move log files into the app's
 * log directory, to make bug reports easier to understand.
 *
 * Will not move files over if the operation doesn't raise an error.
 *
 * @param action The Git action to perform
 * @param logFile A log file that might be generated as part of the
 * @param repositoryPath The folder associated with the repository, for additional investigating.
 */
export async function withTracingCleanup(
  action: () => Promise<IGitResult>,
  logFile: string,
  repositoryPath: string
): Promise<void> {
  try {
    await action()
  } catch (e) {
    await moveTracingToLogDirectory(logFile)
    await copyLFSTraceFilesToLogDirectory(repositoryPath)
    throw e
  }

  await cleanupTracing(logFile)
}
