import * as FSE from 'fs-extra'
import { getTempFilePath } from '../file-system'
import { IGitProgress, IGitProgressInfo, IGitOutput } from './git'
import { formatBytes } from '../../ui/lib/bytes'

/** Create the Git LFS progress reporting file and return the path. */
export async function createLFSProgressFile(): Promise<string> {
  const path = await getTempFilePath('GitHubDesktop-lfs-progress')
  await FSE.ensureFile(path)
  return path
}

// The regex for parsing LFS progress lines. See
// https://github.com/git-lfs/git-lfs/blob/dce20b0d18213d720ff2897267e68960d296eb5e/docs/man/git-lfs-config.5.ronn
// for more info. At a high level:
//
// `<direction> <current>/<total files> <downloaded>/<total> <name>`
const LFSProgressLineRe = /^(.+?)\s{1}(\d+)\/(\d+)\s{1}(\d+)\/(\d+)\s{1}(.+)$/

/** The progress parser for Git LFS. */
export class GitLFSProgressParser {
  private lastResult: IGitProgress | IGitOutput = {
    kind: 'context',
    text: 'Downloading Git LFS file…',
    percent: 0,
  }

  private updates = new Map()

  /** Parse the progress line. */
  public parse(line: string): IGitProgress | IGitOutput {
    const matches = line.match(LFSProgressLineRe)
    if (!matches || matches.length !== 7) {
      return this.lastResult
    }

    const direction = matches[1]
    const current = parseInt(matches[2], 10)
    const totalFiles = parseInt(matches[3], 10)
    const downloadedBytes = parseInt(matches[4], 10)
    const totalBytes = parseInt(matches[5], 10)
    const name = matches[6]

    if (
      !direction ||
      !current ||
      !totalFiles ||
      !downloadedBytes ||
      !totalBytes ||
      !name
    ) {
      return this.lastResult
    }

    if (
      isNaN(current) ||
      isNaN(totalFiles) ||
      isNaN(downloadedBytes) ||
      isNaN(totalBytes)
    ) {
      return this.lastResult
    }

    const update = this.updates.get(current)
      ? this.updates.get(current)
      : new Map()

    update.set('downloadedBytes', downloadedBytes)
    update.set('totalBytes', totalBytes)
    this.updates.set(current, update)

    let downloadedBytesForAllIndexes = 0
    let totalBytesForForAllIndexes = 0
    let finishedFiles = 0

    this.updates.forEach((value, key, map) => {
      const downloaded = value.get('downloadedBytes')
      const total = value.get('totalBytes')
      downloadedBytesForAllIndexes += downloaded
      totalBytesForForAllIndexes += total
      if (downloaded === total) {
        finishedFiles += 1
      }
    })
    const verb = this.directionToHumanFacingVerb(direction)
    const info: IGitProgressInfo = {
      title: `${verb} "${name}" ${formatBytes(
        downloadedBytesForAllIndexes
      )}/${formatBytes(totalBytesForForAllIndexes)}…`,
      value: downloadedBytesForAllIndexes,
      total: totalBytesForForAllIndexes,
      percent: 0,
      done: false,
      text: `${verb} ${finishedFiles}/${totalFiles} ${formatBytes(
        downloadedBytesForAllIndexes
      )}/${formatBytes(totalBytesForForAllIndexes)}`,
    }

    this.lastResult = {
      kind: 'progress',
      percent: 0,
      details: info,
    }

    return this.lastResult
  }

  private directionToHumanFacingVerb(direction: string): string {
    switch (direction) {
      case 'download':
        return 'Downloading'
      case 'upload':
        return 'Uploading'
      case 'checkout':
        return 'Checking out'
      default:
        return 'Downloading'
    }
  }
}
