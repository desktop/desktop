import * as Path from 'path'

import { assertNever } from '../../../lib/fatal-error'

import { getPartialBlobContents } from '../../../lib/git/show'
import { readPartialFile } from '../../../lib/file-system'
import { highlight } from '../../../lib/highlighter/worker'
import { ITokens } from '../../../lib/highlighter/types'

import {
  CommittedFileChange,
  WorkingDirectoryFileChange,
  AppFileStatusKind,
} from '../../../models/status'
import { Repository } from '../../../models/repository'
import { DiffHunk, DiffLineType, DiffLine } from '../../../models/diff'
import { getOldPathOrDefault } from '../../../lib/get-old-path'

/** The maximum number of bytes we'll process for highlighting. */
const MaxHighlightContentLength = 256 * 1024

// There is no good way to get the actual length of the old/new contents,
// since we're directly truncating the git output to up to MaxHighlightContentLength
// characters. Therefore, when we try to limit diff expansion, we can't know if
// a file is exactly MaxHighlightContentLength characters long or longer, so
// we'll look for exactly that amount of characters minus 1.
const MaxDiffExpansionNewContentLength = MaxHighlightContentLength - 1

type ChangedFile = WorkingDirectoryFileChange | CommittedFileChange

interface ILineFilters {
  readonly oldLineFilter: Array<number>
  readonly newLineFilter: Array<number>
}

export interface IFileContents {
  readonly file: ChangedFile
  readonly oldContents: ReadonlyArray<string>
  readonly newContents: ReadonlyArray<string>
  readonly canBeExpanded: boolean
}

interface IFileTokens {
  readonly oldTokens: ITokens
  readonly newTokens: ITokens
}

async function getOldFileContent(
  repository: Repository,
  file: ChangedFile
): Promise<Buffer | null> {
  if (
    file.status.kind === AppFileStatusKind.New ||
    file.status.kind === AppFileStatusKind.Untracked
  ) {
    return null
  }

  let commitish

  if (file instanceof WorkingDirectoryFileChange) {
    // If we pass an empty string here we get the contents
    // that are in the index. But since we call diff with
    // --no-index (see diff.ts) we need to look at what's
    // actually committed to get the appropriate content.
    commitish = 'HEAD'
  } else if (file instanceof CommittedFileChange) {
    commitish = file.parentCommitish
  } else {
    return assertNever(file, 'Unknown file change type')
  }

  return getPartialBlobContents(
    repository,
    commitish,
    getOldPathOrDefault(file),
    MaxHighlightContentLength
  )
}

async function getNewFileContent(
  repository: Repository,
  file: ChangedFile
): Promise<Buffer | null> {
  if (file.status.kind === AppFileStatusKind.Deleted) {
    return null
  }

  if (file instanceof WorkingDirectoryFileChange) {
    return readPartialFile(
      Path.join(repository.path, file.path),
      0,
      MaxHighlightContentLength - 1
    )
  } else if (file instanceof CommittedFileChange) {
    return getPartialBlobContents(
      repository,
      file.commitish,
      file.path,
      MaxHighlightContentLength
    )
  }

  return assertNever(file, 'Unknown file change type')
}

export async function getFileContents(
  repo: Repository,
  file: ChangedFile
): Promise<IFileContents> {
  const [oldContents, newContents] = await Promise.all([
    getOldFileContent(repo, file).catch(e => {
      log.error('Could not load old contents for syntax highlighting', e)
      return null
    }),
    getNewFileContent(repo, file).catch(e => {
      log.error('Could not load new contents for syntax highlighting', e)
      return null
    }),
  ])

  return {
    file,
    oldContents: oldContents?.toString('utf8').split(/\r?\n/) ?? [],
    newContents: newContents?.toString('utf8').split(/\r?\n/) ?? [],
    canBeExpanded:
      newContents !== null &&
      newContents.length <= MaxDiffExpansionNewContentLength,
  }
}

/**
 * Figure out which lines we need to have tokenized in
 * both the old and new version of the file.
 */
export function getLineFilters(hunks: ReadonlyArray<DiffHunk>): ILineFilters {
  const oldLineFilter = new Array<number>()
  const newLineFilter = new Array<number>()

  const diffLines = new Array<DiffLine>()

  let anyAdded = false
  let anyDeleted = false

  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      anyAdded = anyAdded || line.type === DiffLineType.Add
      anyDeleted = anyDeleted || line.type === DiffLineType.Delete
      diffLines.push(line)
    }
  }

  for (const line of diffLines) {
    // So this might need a little explaining. What we're trying
    // to achieve here is if the diff contains only additions or
    // only deletions we'll source all the highlighted lines from
    // either the before or after file. That way we can completely
    // disregard highlighting, the other version.
    if (line.oldLineNumber !== null && line.newLineNumber !== null) {
      if (anyAdded && !anyDeleted) {
        newLineFilter.push(line.newLineNumber - 1)
      } else {
        oldLineFilter.push(line.oldLineNumber - 1)
      }
    } else {
      // If there's a mix (meaning we'll have to read from both
      // anyway) we'll prioritize the old version since
      // that's immutable and less likely to be the subject of a
      // race condition when someone rapidly modifies the file on
      // disk.
      if (line.oldLineNumber !== null) {
        oldLineFilter.push(line.oldLineNumber - 1)
      } else if (line.newLineNumber !== null) {
        newLineFilter.push(line.newLineNumber - 1)
      }
    }
  }

  return { oldLineFilter, newLineFilter }
}

export async function highlightContents(
  contents: IFileContents,
  tabSize: number,
  lineFilters: ILineFilters
): Promise<IFileTokens> {
  const { file, oldContents, newContents } = contents

  const oldPath = getOldPathOrDefault(file)

  const [oldTokens, newTokens] = await Promise.all([
    oldContents === null
      ? {}
      : highlight(
          oldContents,
          Path.basename(oldPath),
          Path.extname(oldPath),
          tabSize,
          lineFilters.oldLineFilter
        ).catch(e => {
          log.error('Highlighter worked failed for old contents', e)
          return {}
        }),
    newContents === null
      ? {}
      : highlight(
          newContents,
          Path.basename(file.path),
          Path.extname(file.path),
          tabSize,
          lineFilters.newLineFilter
        ).catch(e => {
          log.error('Highlighter worked failed for new contents', e)
          return {}
        }),
  ])

  return { oldTokens, newTokens }
}
