import * as Path from 'path'
import * as Fs from 'fs'

import { getBlobContents } from './show'

import { Repository } from '../../models/repository'
import {
  WorkingDirectoryFileChange,
  FileChange,
  AppFileStatus,
} from '../../models/status'
import {
  DiffType,
  IRawDiff,
  IDiff,
  IImageDiff,
  Image,
  maximumDiffStringSize,
  LineEndingsChange,
  parseLineEndingText,
} from '../../models/diff'

import { spawnAndComplete } from './spawn'

import { DiffParser } from '../diff-parser'

/**
 * Utility function to check whether parsing this buffer is going to cause
 * issues at runtime.
 *
 * @param output A buffer of binary text from a spawned process
 */
function isValidBuffer(output: Buffer) {
  return output.length < maximumDiffStringSize
}

/**
 *  Defining the list of known extensions we can render inside the app
 */
const imageFileExtensions = new Set(['.png', '.jpg', '.jpeg', '.gif'])

/**
 * Render the difference between a file in the given commit and its parent
 *
 * @param commitish A commit SHA or some other identifier that ultimately dereferences
 *                  to a commit.
 */
export async function getCommitDiff(
  repository: Repository,
  file: FileChange,
  commitish: string
): Promise<IDiff> {
  const args = [
    'log',
    commitish,
    '-m',
    '-1',
    '--first-parent',
    '--patch-with-raw',
    '-z',
    '--no-color',
    '--',
    file.path,
  ]

  const { output } = await spawnAndComplete(
    args,
    repository.path,
    'getCommitDiff'
  )
  if (!isValidBuffer(output)) {
    return { kind: DiffType.TooLarge, length: output.length }
  }

  const diffText = diffFromRawDiffOutput(output)
  return convertDiff(repository, file, diffText, commitish)
}

/**
 * Render the diff for a file within the repository working directory. The file will be
 * compared against HEAD if it's tracked, if not it'll be compared to an empty file meaning
 * that all content in the file will be treated as additions.
 */
export async function getWorkingDirectoryDiff(
  repository: Repository,
  file: WorkingDirectoryFileChange
): Promise<IDiff> {
  let successExitCodes: Set<number> | undefined
  let args: Array<string>

  // `--no-ext-diff` should be provided wherever we invoke `git diff` so that any
  // diff.external program configured by the user is ignored

  if (file.status === AppFileStatus.New) {
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
    successExitCodes = new Set([0, 1])
    args = [
      'diff',
      '--no-ext-diff',
      '--no-index',
      '--patch-with-raw',
      '-z',
      '--no-color',
      '--',
      '/dev/null',
      file.path,
    ]
  } else if (file.status === AppFileStatus.Renamed) {
    // NB: Technically this is incorrect, the best kind of incorrect.
    // In order to show exactly what will end up in the commit we should
    // perform a diff between the new file and the old file as it appears
    // in HEAD. By diffing against the index we won't show any changes
    // already staged to the renamed file which differs from our other diffs.
    // The closest I got to that was running hash-object and then using
    // git diff <blob> <blob> but that seems a bit excessive.
    args = [
      'diff',
      '--no-ext-diff',
      '--patch-with-raw',
      '-z',
      '--no-color',
      '--',
      file.path,
    ]
  } else {
    args = [
      'diff',
      'HEAD',
      '--no-ext-diff',
      '--patch-with-raw',
      '-z',
      '--no-color',
      '--',
      file.path,
    ]
  }

  const { output, error } = await spawnAndComplete(
    args,
    repository.path,
    'getWorkingDirectoryDiff',
    successExitCodes
  )
  if (!isValidBuffer(output)) {
    // we know we can't transform this process output into a diff, so let's
    // just return a placeholder for now that we can display to the user
    // to say we're at the limits of the runtime
    return { kind: DiffType.TooLarge, length: output.length }
  }

  const diffText = diffFromRawDiffOutput(output)
  const lineEndingsChange = parseLineEndingsWarning(error)

  return convertDiff(repository, file, diffText, 'HEAD', lineEndingsChange)
}

async function getImageDiff(
  repository: Repository,
  file: FileChange,
  commitish: string
): Promise<IImageDiff> {
  let current: Image | undefined = undefined
  let previous: Image | undefined = undefined

  // Are we looking at a file in the working directory or a file in a commit?
  if (file instanceof WorkingDirectoryFileChange) {
    // No idea what to do about this, a conflicted binary (presumably) file.
    // Ideally we'd show all three versions and let the user pick but that's
    // a bit out of scope for now.
    if (file.status === AppFileStatus.Conflicted) {
      return { kind: DiffType.Image }
    }

    // Does it even exist in the working directory?
    if (file.status !== AppFileStatus.Deleted) {
      current = await getWorkingDirectoryImage(repository, file)
    }

    if (file.status !== AppFileStatus.New) {
      // If we have file.oldPath that means it's a rename so we'll
      // look for that file.
      previous = await getBlobImage(
        repository,
        file.oldPath || file.path,
        'HEAD'
      )
    }
  } else {
    // File status can't be conflicted for a file in a commit
    if (file.status !== AppFileStatus.Deleted) {
      current = await getBlobImage(repository, file.path, commitish)
    }

    // File status can't be conflicted for a file in a commit
    if (file.status !== AppFileStatus.New) {
      // TODO: commitish^ won't work for the first commit
      //
      // If we have file.oldPath that means it's a rename so we'll
      // look for that file.
      previous = await getBlobImage(
        repository,
        file.oldPath || file.path,
        `${commitish}^`
      )
    }
  }

  return {
    kind: DiffType.Image,
    previous: previous,
    current: current,
  }
}

export async function convertDiff(
  repository: Repository,
  file: FileChange,
  diff: IRawDiff,
  commitish: string,
  lineEndingsChange?: LineEndingsChange
): Promise<IDiff> {
  if (diff.isBinary) {
    const extension = Path.extname(file.path)

    // some extension we don't know how to parse, never mind
    if (!imageFileExtensions.has(extension)) {
      return {
        kind: DiffType.Binary,
      }
    } else {
      return getImageDiff(repository, file, commitish)
    }
  }

  return {
    kind: DiffType.Text,
    text: diff.contents,
    hunks: diff.hunks,
    lineEndingsChange,
  }
}

/**
 * Map a given file extension to the related data URL media type
 */
function getMediaType(extension: string) {
  if (extension === '.png') {
    return 'image/png'
  }
  if (extension === '.jpg' || extension === '.jpeg') {
    return 'image/jpg'
  }
  if (extension === '.gif') {
    return 'image/gif'
  }

  // fallback value as per the spec
  return 'text/plain'
}

/**
 * `git diff` will write out messages about the line ending changes it knows
 * about to `stderr` - this rule here will catch this and also the to/from
 * changes based on what the user has configured.
 */
const lineEndingsChangeRegex = /warning: (CRLF|CR|LF) will be replaced by (CRLF|CR|LF) in .*/

/**
 * Utility function for inspecting the stderr output for the line endings
 * warning that Git may report.
 *
 * @param error A buffer of binary text from a spawned process
 */
function parseLineEndingsWarning(error: Buffer): LineEndingsChange | undefined {
  if (error.length === 0) {
    return undefined
  }

  const errorText = error.toString('utf-8')
  const match = lineEndingsChangeRegex.exec(errorText)
  if (match) {
    const from = parseLineEndingText(match[1])
    const to = parseLineEndingText(match[2])
    if (from && to) {
      return { from, to }
    }
  }

  return undefined
}

/**
 * Utility function used by get(Commit|WorkingDirectory)Diff.
 *
 * Parses the output from a diff-like command that uses `--path-with-raw`
 */
function diffFromRawDiffOutput(output: Buffer): IRawDiff {
  // for now we just assume the diff is UTF-8, but given we have the raw buffer
  // we can try and convert this into other encodings in the future
  const result = output.toString('utf-8')

  const pieces = result.split('\0')
  const parser = new DiffParser()
  return parser.parse(pieces[pieces.length - 1])
}

export async function getBlobImage(
  repository: Repository,
  path: string,
  commitish: string
): Promise<Image> {
  const extension = Path.extname(path)
  const contents = await getBlobContents(repository, commitish, path)
  const diff: Image = {
    contents: contents.toString('base64'),
    mediaType: getMediaType(extension),
  }
  return diff
}

export async function getWorkingDirectoryImage(
  repository: Repository,
  file: FileChange
): Promise<Image> {
  const extension = Path.extname(file.path)
  const contents = await getWorkingDirectoryContents(repository, file)
  const diff: Image = {
    contents: contents,
    mediaType: getMediaType(extension),
  }
  return diff
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
async function getWorkingDirectoryContents(
  repository: Repository,
  file: FileChange
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const path = Path.join(repository.path, file.path)

    Fs.readFile(path, { flag: 'r' }, (error, buffer) => {
      if (error) {
        reject(error)
        return
      }
      resolve(buffer.toString('base64'))
    })
  })
}
