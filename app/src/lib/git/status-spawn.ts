import { GitProcess } from 'dugite'
import {
  WorkingDirectoryStatus,
  WorkingDirectoryFileChange,
  AppFileStatus,
  FileEntry,
  GitStatusEntry,
} from '../../models/status'
import {
  mapStatus,
  parseChangedEntry,
  parseUnmergedEntry,
  parsedRenamedOrCopiedEntry,
  parseUntrackedEntry,
} from '../status-parser'
import { DiffSelectionType, DiffSelection } from '../../models/diff'
import { Repository } from '../../models/repository'
import { IAheadBehind } from './rev-list'
import { fatalError } from '../../lib/fatal-error'

/** The encapsulation of the result from 'git status' */
export interface IStatusResult {
  readonly currentBranch?: string
  readonly currentUpstreamBranch?: string
  readonly currentTip?: string
  readonly branchAheadBehind?: IAheadBehind

  /** true if the repository exists at the given location */
  readonly exists: boolean

  /** the absolute path to the repository's working directory */
  readonly workingDirectory: WorkingDirectoryStatus
}

function convertToAppStatus(status: FileEntry): AppFileStatus {
  if (status.kind === 'ordinary') {
    switch (status.type) {
      case 'added':
        return AppFileStatus.New
      case 'modified':
        return AppFileStatus.Modified
      case 'deleted':
        return AppFileStatus.Deleted
    }
  } else if (status.kind === 'copied') {
    return AppFileStatus.Copied
  } else if (status.kind === 'renamed') {
    return AppFileStatus.Renamed
  } else if (status.kind === 'conflicted') {
    return AppFileStatus.Conflicted
  } else if (status.kind === 'untracked') {
    return AppFileStatus.New
  }

  return fatalError(`Unknown file status ${status}`)
}

export interface IStatusHeader {
  readonly kind: 'header'
  readonly value: string
}

/** A representation of a parsed status entry from git status */
export interface IStatusEntry {
  readonly kind: 'entry'

  /** The path to the file relative to the repository root */
  readonly path: string

  /** The two character long status code */
  readonly statusCode: string

  /** The original path in the case of a renamed file */
  readonly oldPath?: string
}

const ChangedEntryType = '1'
const RenamedOrCopiedEntryType = '2'
const UnmergedEntryType = 'u'
const UntrackedEntryType = '?'
const IgnoredEntryType = '!'

function parseStatusItem(
  entry: IStatusEntry,
  files: Array<WorkingDirectoryFileChange>
) {
  const status = mapStatus(entry.statusCode)

  if (status.kind === 'ordinary') {
    // when a file is added in the index but then removed in the working
    // directory, the file won't be part of the commit, so we can skip
    // displaying this entry in the changes list
    if (
      status.index === GitStatusEntry.Added &&
      status.workingTree === GitStatusEntry.Deleted
    ) {
      return null
    }
  }

  if (status.kind === 'untracked') {
    // when a delete has been staged, but an untracked file exists with the
    // same path, we should ensure that we only draw one entry in the
    // changes list - see if an entry already exists for this path and
    // remove it if found
    const existingEntry = files.findIndex(p => p.path === entry.path)
    if (existingEntry > -1) {
      files.splice(existingEntry, 1)
    }
  }

  // for now we just poke at the existing summary
  const summary = convertToAppStatus(status)
  const selection = DiffSelection.fromInitialSelection(DiffSelectionType.All)

  return new WorkingDirectoryFileChange(
    entry.path,
    summary,
    selection,
    entry.oldPath
  )
}

/**
 *  Retrieve the status for a given repository,
 *  and fail gracefully if the location is not a Git repository
 */
export async function getStatusSpawnRaw(
  repository: Repository
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const args = [
      'status',
      '--untracked-files=all',
      '--branch',
      '--porcelain=2',
      '-z',
    ]

    let output = ''

    const status = GitProcess.spawn(args, repository.path)

    status.stdout.setEncoding('utf8')

    status.stdout.on('data', (chunk: Buffer) => {
      const newText = chunk.toString()
      output += newText
    })

    status.on('close', (code, signal) => {
      if (code === 0 || signal) {
        resolve(output)
      } else {
        reject(
          new Error(
            `Git returned an unexpected exit code '${code}' which should be handled by the caller.'`
          )
        )
      }
    })
  })
}

class StatusTokenizer {
  private remainingText: string | null = null

  public nextToken(): string | null {
    if (this.remainingText == null) {
      return null
    }

    const nextIndex = this.remainingText.indexOf('\0')
    if (nextIndex === -1) {
      return null
    }

    const token = this.remainingText.slice(0, nextIndex)
    this.remainingText = this.remainingText.slice(nextIndex + 1)

    return token
  }

  public enqueueData(chunk: Buffer) {
    const newText = chunk.toString()

    if (this.remainingText != null) {
      // append any remaining output from the previous call
      // because spawn might emit a partial entry
      this.remainingText = this.remainingText + newText
    } else {
      this.remainingText = newText
    }
  }
}

/**
 *  Retrieve the status for a given repository,
 *  and fail gracefully if the location is not a Git repository
 */
export async function getStatusSpawn(
  repository: Repository
): Promise<IStatusResult> {
  return new Promise<IStatusResult>((resolve, reject) => {
    const args = [
      'status',
      '--untracked-files=all',
      '--branch',
      '--porcelain=2',
      '-z',
    ]

    const files = new Array<WorkingDirectoryFileChange>()

    let currentBranch: string | undefined = undefined
    let currentUpstreamBranch: string | undefined = undefined
    let currentTip: string | undefined = undefined
    let branchAheadBehind: IAheadBehind | undefined = undefined

    const status = GitProcess.spawn(args, repository.path)

    const tokenizer = new StatusTokenizer()

    let m: RegExpMatchArray | null

    status.stdout.setEncoding('utf8')

    let item: WorkingDirectoryFileChange | null = null

    status.stdout.on('data', (chunk: Buffer) => {
      tokenizer.enqueueData(chunk)

      let field = tokenizer.nextToken()

      while (field != null) {
        if (field.startsWith('# ') && field.length > 2) {
          const value = field.substr(2)

          // This intentionally does not match branch.oid initial
          if ((m = value.match(/^branch\.oid ([a-f0-9]+)$/))) {
            currentTip = m[1]
          } else if ((m = value.match(/^branch.head (.*)/))) {
            if (m[1] !== '(detached)') {
              currentBranch = m[1]
            }
          } else if ((m = value.match(/^branch.upstream (.*)/))) {
            currentUpstreamBranch = m[1]
          } else if ((m = value.match(/^branch.ab \+(\d+) -(\d+)$/))) {
            const ahead = parseInt(m[1], 10)
            const behind = parseInt(m[2], 10)

            if (!isNaN(ahead) && !isNaN(behind)) {
              branchAheadBehind = { ahead, behind }
            }
          }

          field = tokenizer.nextToken()
          continue
        }

        const entryKind = field.substr(0, 1)

        switch (entryKind) {
          case ChangedEntryType:
            item = parseStatusItem(parseChangedEntry(field), files)
            break
          case RenamedOrCopiedEntryType:
            const oldPath = tokenizer.nextToken()
            if (oldPath == null) {
              log.debug(
                '[status] we ran out of tokens at a really inappropriate time'
              )
              break
            }
            item = parseStatusItem(
              parsedRenamedOrCopiedEntry(field, oldPath),
              files
            )
            if (item != null) {
              files.push(item)
            }

            break
          case UnmergedEntryType:
            item = parseStatusItem(parseUnmergedEntry(field), files)
            break
          case UntrackedEntryType:
            item = parseStatusItem(parseUntrackedEntry(field), files)
            break
          default:
            // Ignored, we don't care about these for now
            item = null
        }

        if (item != null) {
          files.push(item)
        }

        field = tokenizer.nextToken()
      }
    })

    status.on('error', err => {
      // for unhandled errors raised by the process, let's surface this in the
      // promise and make the caller handle it
      reject(err)
    })

    status.on('close', (code, signal) => {
      if (code === 0 || signal) {
        const workingDirectory = WorkingDirectoryStatus.fromFiles(files)

        resolve({
          currentBranch,
          currentTip,
          currentUpstreamBranch,
          branchAheadBehind,
          exists: true,
          workingDirectory,
        })
      } else {
        reject(
          new Error(
            `Git returned an unexpected exit code '${code}' which should be handled by the caller.'`
          )
        )
      }
    })
  })
}
