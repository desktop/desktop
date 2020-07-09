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
  /**
   * The number of bytes that have been transferred
   * for this file
   */
  readonly transferred: number

  /**
   * The total size of the file in bytes
   */
  readonly size: number

  /**
   * Whether this file has been transferred fully
   */
  readonly done: boolean
}

/** The progress parser for Git LFS. */
export class GitLFSProgressParser {
  /**
   * A map keyed on the name of each file that LFS has reported
   * progress on with the last seen progress as the value.
   */
  private readonly files = new Map<string, IFileProgress>()

  /** Parse the progress line. */
  public parse(line: string): IGitProgress | IGitOutput {
    const matches = line.match(LFSProgressLineRe)
    if (!matches || matches.length !== 7) {
      return { kind: 'context', percent: 0, text: line }
    }

    const direction = matches[1]
    const estimatedFileCount = parseInt(matches[3], 10)
    const fileTransferred = parseInt(matches[4], 10)
    const fileSize = parseInt(matches[5], 10)
    const fileName = matches[6]

    if (
      isNaN(estimatedFileCount) ||
      isNaN(fileTransferred) ||
      isNaN(fileSize)
    ) {
      return { kind: 'context', percent: 0, text: line }
    }

    this.files.set(fileName, {
      transferred: fileTransferred,
      size: fileSize,
      done: fileTransferred === fileSize,
    })

    let totalTransferred = 0
    let totalEstimated = 0
    let finishedFiles = 0

    // When uploading LFS files the estimate is accurate but not
    // when downloading so we'll choose whichever is biggest of the estimate
    // and the actual number of files we've seen
    const fileCount = Math.max(estimatedFileCount, this.files.size)

    for (const file of this.files.values()) {
      totalTransferred += file.transferred
      totalEstimated += file.size
      finishedFiles += file.done ? 1 : 0
    }

    const transferProgress = `${formatBytes(
      totalTransferred,
      1
    )} / ${formatBytes(totalEstimated, 1)}`

    const verb = this.directionToHumanFacingVerb(direction)
    const info: IGitProgressInfo = {
      title: `${verb} "${fileName}"`,
      value: totalTransferred,
      total: totalEstimated,
      percent: 0,
      done: false,
      text: `${verb} ${fileName} (${finishedFiles} out of an estimated ${fileCount} completed, ${transferProgress})`,
    }

    return {
      kind: 'progress',
      percent: 0,
      details: info,
    }
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
