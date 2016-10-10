import * as Path from 'path'
import { ChildProcess } from 'child_process'
import * as Fs from 'fs'

import { git, IGitExecutionOptions } from './core'

import { Repository } from '../../models/repository'
import { WorkingDirectoryFileChange, FileChange, FileStatus } from '../../models/status'
import { Diff, ImageDiff  } from '../../models/diff'

import { DiffParser } from '../diff-parser'

export class ImageDiffSummary {
  public readonly previous: ImageDiff | undefined
  public readonly current: ImageDiff | undefined
}

export class GitDiff {

  /**
   *  Defining the list of known extensions we can render inside the app
   */
  private static imageFileExtensions = new Set([ '.png', '.jpg', '.jpeg', '.gif' ])

  /**
   * Render the difference between a file in the given commit and its parent
   *
   * @param commitish A commit SHA or some other identifier that ultimately dereferences
   *                  to a commit.
   */
  public static getCommitDiff(repository: Repository, file: FileChange, commitish: string): Promise<Diff> {

    const args = [ 'log', commitish, '-m', '-1', '--first-parent', '--patch-with-raw', '-z', '--', file.path ]

    return git(args, repository.path)
      .then(value => this.diffFromRawDiffOutput(value.stdout))
      .then(diff => {
        // TODO: if this is a binary file and a known file extension
        //       let's try and find the blob for this file
        return diff
      })
  }

  /**
   * Render the diff for a file within the repository working directory. The file will be
   * compared against HEAD if it's tracked, if not it'll be compared to an empty file meaning
   * that all content in the file will be treated as additions.
   */
  public static getWorkingDirectoryDiff(repository: Repository, file: WorkingDirectoryFileChange): Promise<Diff> {

    let opts: IGitExecutionOptions | undefined
    let args: Array<string>

    if (file.status === FileStatus.New) {
      // `git diff --no-index` seems to emulate the exit codes from `diff` irrespective of
      // whether you set --exit-code
      //
      // this is the behaviour:
      // - 0 if no changes found
      // - 1 if changes found
      // -   and error otherwise
      //
      // citation in source:
      // https://github.com/git/git/blob/1f66975deb8402131fbf7c14330d0c7cdebaeaa2/diff-no-index.c#L300
      opts = { successExitCodes: new Set([ 0, 1 ]) }
      args = [ 'diff', '--no-index', '--patch-with-raw', '-z', '--', '/dev/null', file.path ]
    } else if (file.status === FileStatus.Renamed) {
      // NB: Technically this is incorrect, the best way of incorrect.
      // In order to show exactly what will end up in the commit we should
      // perform a diff between the new file and the old file as it appears
      // in HEAD. By diffing against the index we won't show any changes
      // already staged to the renamed file which differs from our other diffs.
      // The closest I got to that was running hash-object and then using
      // git diff <blob> <blob> but that seems a bit excessive.
      args = [ 'diff', '--patch-with-raw', '-z', '--', file.path ]
    } else {
      args = [ 'diff', 'HEAD', '--patch-with-raw', '-z', '--', file.path ]
    }

    return git(args, repository.path, opts)
      .then(value => this.diffFromRawDiffOutput(value.stdout))
      .then(async diff => {

        // already have a text diff, bail out
        if (!diff.isBinary) {
          return diff
        }

        const extension = Path.extname(file.path)

        // unable to find an extension, bail out
        if (extension === '') {
          return diff
        }

        // some extension we don't know how to parse, bail out
        if (!GitDiff.imageFileExtensions.has(extension)) {
          return diff
        }

        if (file.status === FileStatus.New) {
          const currentContents = await GitDiff.getWorkingDirectoryContents(repository, file)
          const current: ImageDiff =  {
            contents: currentContents,
            mediaType: GitDiff.getMediaType(extension),
          }
          diff.current = current
          return diff
        }

        if (file.status === FileStatus.Modified) {
          const currentContents = await GitDiff.getWorkingDirectoryContents(repository, file)
          const current: ImageDiff =  {
            contents: currentContents,
            mediaType: GitDiff.getMediaType(extension),
          }
          diff.current = current

          const previousContents = await GitDiff.getBlobContents(repository, file)
          const previous: ImageDiff =  {
            contents: previousContents,
            mediaType: GitDiff.getMediaType(extension),
          }
          diff.previous = previous
          return diff
        }

        if (file.status === FileStatus.Deleted) {
          const previousContents = await GitDiff.getBlobContents(repository, file)
          const previous: ImageDiff =  {
            contents: previousContents,
            mediaType: GitDiff.getMediaType(extension),
          }
          diff.previous = previous
          return diff
        }

        // probably some other things
        return diff
      })
  }

  /**
   * Map a given file extension to the related data URL media type
   */
  private static getMediaType(extension: string) {
    if (extension === '.png') {
      return 'image/png'
    }
    if (extension === '.jpg' || extension === '.jpeg') {
      return 'image/jpg'
    }
    if (extension === '.gif') {
      return 'image/gif'
    }

    // fallback value, gonna have a bad time
    return 'text/plain'
  }

  /**
   * Utility function used by get(Commit|WorkingDirectory)Diff.
   *
   * Parses the output from a diff-like command that uses `--path-with-raw`
   */
  private static diffFromRawDiffOutput(result: string): Diff {
    const pieces = result.split('\0')
    const parser = new DiffParser()
    return parser.parse(pieces[pieces.length - 1])
  }

  /**
   * Retrieve the binary contents of a blob from the repository
   *
   * Returns a promise containing the base64 encoded string,
   * as <img> tags support the data URI scheme instead of
   * needing to reference a file:// URI
   *
   * https://en.wikipedia.org/wiki/Data_URI_scheme
   *
   */
  private static async getBlobContents(repository: Repository, file: FileChange): Promise<string> {

    const successExitCodes = new Set([ 0, 1 ])

    const lsTreeArgs = [ 'ls-tree', 'HEAD', '-z', '--', file.path ]
    const blobRow = await git(lsTreeArgs, repository.path, { successExitCodes })

    // a mixture of whitespace and tab characters here
    // so let's just split on everything interesting
    const blobDetails = blobRow.stdout.split(/\s/)
    const blob = blobDetails[2]

    const catFileArgs = [ 'cat-file', '-p', blob ]

    const setBinaryEncoding: (process: ChildProcess) => void = cb => cb.stdout.setEncoding('binary')

    const blob_contents = await git(catFileArgs, repository.path, { successExitCodes, processCallback: setBinaryEncoding })
    const base64Contents = Buffer.from(blob_contents.stdout, 'binary').toString('base64')

    return Promise.resolve(base64Contents)
  }

  /**
   * Retrieve the binary contents of a blob from the working directory
   *
   * Returns a promise containing the base64 encoded string,
   * as <img> tags support the data URI scheme instead of
   * needing to reference a file:// URI
   *
   * https://en.wikipedia.org/wiki/Data_URI_scheme
   *
   */
  private static async getWorkingDirectoryContents(repository: Repository, file: FileChange): Promise<string> {

    const path = Path.join(repository.path, file.path)

    const rawImageBytes = Fs.readFileSync(path, { encoding: 'binary', flag: 'r' })
    const base64Contents = Buffer.from(rawImageBytes, 'binary').toString('base64')

    return Promise.resolve(base64Contents)
  }
}
