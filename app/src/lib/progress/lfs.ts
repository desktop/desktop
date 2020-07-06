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

interface IFileProgress {
  readonly transferred: number
  readonly total: number
  readonly done: boolean
}

/** The progress parser for Git LFS. */
export class GitLFSProgressParser {
  private lastResult: IGitProgress | IGitOutput = {
    kind: 'context',
    text: 'Downloading Git LFS file…',
    percent: 0,
  }

  /**
   * A map keyed on the name of each file that LFS has reported
   * progress on with the last seen progress as the value.
   */
  private readonly files = new Map<string, IFileProgress>()

  /** Parse the progress line. */
  public parse(line: string): IGitProgress | IGitOutput {
    const matches = line.match(LFSProgressLineRe)
    if (!matches || matches.length !== 7) {
      return this.lastResult
    }

    const direction = matches[1]
    const totalFiles = parseInt(matches[3], 10)
    const downloadedBytes = parseInt(matches[4], 10)
    const totalBytes = parseInt(matches[5], 10)
    const name = matches[6]

    if (isNaN(totalFiles) || isNaN(downloadedBytes) || isNaN(totalBytes)) {
      return this.lastResult
    }

    this.files.set(name, {
      transferred: downloadedBytes,
      total: totalBytes,
      done: downloadedBytes === totalBytes,
    })

    let downloadedBytesForAllIndexes = 0
    let totalBytesForForAllIndexes = 0
    let finishedFiles = 0

    // When uploading LFS files the estimate is accurate but not
    // when downloading so we'll whichever is biggest of the estimate
    // and the actual number of files we've seen
    const estimatedTotalFiles = Math.max(totalFiles, this.files.size)

    for (const file of this.files.values()) {
      downloadedBytesForAllIndexes += file.transferred
      totalBytesForForAllIndexes += file.total
      finishedFiles += file.done ? 1 : 0
    }

    const transferProgress = `${formatBytes(
      downloadedBytesForAllIndexes
    )} / ${formatBytes(totalBytesForForAllIndexes)}`

    const verb = this.directionToHumanFacingVerb(direction)
    const info: IGitProgressInfo = {
      value: downloadedBytesForAllIndexes,
      total: totalBytesForForAllIndexes,
      title: `${verb} "${fileName}"`,
      percent: 0,
      done: false,
      text: `${verb} ${name} (${finishedFiles} out of an estimated ${estimatedTotalFiles} completed, ${transferProgress})`,
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
