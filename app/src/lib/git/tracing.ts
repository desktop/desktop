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

async function moveTracingToLogDirectory(logFile: string): Promise<void> {
  const exists = await pathExists(logFile)
  if (exists) {
    return new Promise<void>((resolve, reject) => {
      const fileName = Path.basename(logFile)
      const userData = getUserDataPath()
      const logsDir = Path.join(userData, 'logs', fileName)
      Fs.move(logFile, logsDir, err => {
        if (err) {
          log.debug('Unable to move tracing file to logs directory', err)
        }
        resolve()
      })
    })
  }
}

async function copyLFSTraceFilesToLogDirectory(
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
