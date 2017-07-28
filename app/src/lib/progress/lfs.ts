import * as Fs from 'fs'
import { getTempFilePath } from '../file-system'
import { IGitProgress, IGitProgressInfo, IGitOutput } from './git'

/** Create the Git LFS progress reporting file and return the path. */
export async function createLFSProgressFile(): Promise<string> {
  const path = await getTempFilePath('GitHubDesktop-lfs-progress')
  return new Promise<string>((resolve, reject) => {
    Fs.writeFile(path, '', err => {
      if (err) {
        reject(err)
      } else {
        resolve(path)
      }
    })
  })
}

// The regex for parsing LFS progress lines. See
// https://github.com/git-lfs/git-lfs/blob/dce20b0d18213d720ff2897267e68960d296eb5e/docs/man/git-lfs-config.5.ronn
// for more info. At a high level:
//
// `<direction> <current>/<total files> <downloaded>/<total> <name>`
const LFSProgressLineRe = /^(.+?)\s{1}(\d+)\/(\d+)\s{1}(\d+)\/(\d+)\s{1}(.+)$/

/** The progress parser for Git LFS. */
export class GitLFSProgressParser {
  /** Parse the progress line. */
  public parse(line: string): IGitProgress | IGitOutput {
    const cannotParseResult: IGitOutput = {
      kind: 'context',
      text: line,
      percent: 0,
    }

    const matches = line.match(LFSProgressLineRe)
    if (!matches || matches.length !== 7) {
      return cannotParseResult
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
      return cannotParseResult
    }

    if (
      isNaN(current) ||
      isNaN(totalFiles) ||
      isNaN(downloadedBytes) ||
      isNaN(totalBytes)
    ) {
      return cannotParseResult
    }

    const percent = downloadedBytes / totalBytes
    const info: IGitProgressInfo = {
      title: `Downloading ${name}…`,
      value: downloadedBytes,
      total: totalBytes,
      percent,
      done: false,
      text: line,
    }
    return {
      kind: 'progress',
      percent,
      details: info,
    }
  }
}
