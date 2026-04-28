import { readFile, stat } from 'fs/promises'
import { extname } from 'path'

import { Repository } from '../models/repository'
import { Commit } from '../models/commit'
import { PullRequest } from '../models/pull-request'
import { getMergeBase } from './git/merge'
import { getCommits } from './git/log'
import { resolveWithin } from './path'

/** A single conflict hunk extracted from a file with conflict markers */
export interface IConflictHunk {
  /** Content from the current branch (between <<<<<<< and =======) */
  readonly oursContent: string
  /** Content from the incoming branch (between ======= and >>>>>>>) */
  readonly theirsContent: string
  /** Base content if diff3 markers are present (between ||||||| and =======), null otherwise */
  readonly baseContent: string | null
  /** Lines of unchanged content before the conflict marker */
  readonly contextBefore: string
  /** Lines of unchanged content after the conflict marker */
  readonly contextAfter: string
}

/** Conflict context for a single file */
export interface IFileConflictContext {
  /** Repository-relative file path */
  readonly path: string
  /** All conflict hunks in the file (empty if skipped) */
  readonly hunks: ReadonlyArray<IConflictHunk>
  /** If the file was skipped, the reason why (shown in prompt so Copilot knows) */
  readonly skippedReason?: string
}

/**
 * Full conflict context for a merge, rebase, or cherry-pick operation.
 *
 * Labels are used instead of branch names because for rebase and cherry-pick
 * the "theirs" side is a specific commit, not a branch.
 */
export interface ICopilotConflictContext {
  /** Label for the current side (e.g., branch name or "main (rebase target)") */
  readonly ourLabel: string
  /** Label for the incoming side (e.g., branch name or "abc1234: Add UUID support") */
  readonly theirLabel: string
  /** All conflicted files with their conflict data */
  readonly files: ReadonlyArray<IFileConflictContext>
}

/** Commit context from both sides of a merge conflict */
export interface IConflictCommitContext {
  readonly ourCommits: ReadonlyArray<Commit>
  readonly theirCommits: ReadonlyArray<Commit>
}

const oursMarker = /^<{7}(?:\s|$)/
const baseMarker = /^\|{7}(?:\s|$)/
const separatorMarker = /^={7}$/
const theirsMarker = /^>{7}(?:\s|$)/

/** Maximum file size (in bytes) to include in conflict context */
const MAX_CONFLICT_FILE_SIZE = 1_048_576

function isConflictMarker(line: string): boolean {
  return (
    oursMarker.test(line) ||
    baseMarker.test(line) ||
    separatorMarker.test(line) ||
    theirsMarker.test(line)
  )
}

/**
 * Parse a file's text content and extract all conflict hunks.
 *
 * Handles both standard two-way conflict markers (`<<<<<<<`, `=======`,
 * `>>>>>>>`) and diff3 three-way markers that also include a `|||||||`
 * section for the merge base content.
 *
 * @param fileContent - The full text content of the conflicted file
 * @param contextLines - Number of surrounding unchanged lines to include
 *                       around each hunk (default: 3)
 * @returns An array of extracted conflict hunks, empty if no markers found
 */
export function extractConflictHunks(
  fileContent: string,
  contextLines: number = 3
): ReadonlyArray<IConflictHunk> {
  const lines = fileContent.split(/\r?\n/)
  const hunks: Array<IConflictHunk> = []

  let i = 0
  while (i < lines.length) {
    if (!oursMarker.test(lines[i])) {
      i++
      continue
    }

    const oursStart = i + 1
    const oursLines: Array<string> = []
    const baseLines: Array<string> = []
    let hasBase = false
    const theirsLines: Array<string> = []
    let hunkEnd = -1

    i = oursStart
    // Collect ours content
    while (i < lines.length) {
      if (baseMarker.test(lines[i])) {
        hasBase = true
        i++
        break
      }
      if (separatorMarker.test(lines[i])) {
        i++
        break
      }
      oursLines.push(lines[i])
      i++
    }

    // If diff3, collect base content until separator
    if (hasBase) {
      while (i < lines.length) {
        if (separatorMarker.test(lines[i])) {
          i++
          break
        }
        baseLines.push(lines[i])
        i++
      }
    }

    // Collect theirs content until closing marker
    while (i < lines.length) {
      if (theirsMarker.test(lines[i])) {
        hunkEnd = i
        i++
        break
      }
      theirsLines.push(lines[i])
      i++
    }

    // If we never found the closing marker, skip this malformed hunk
    if (hunkEnd === -1) {
      continue
    }

    // The ours marker line is at oursStart - 1
    const markerStart = oursStart - 1
    const contextStart = Math.max(0, markerStart - contextLines)
    const contextEnd = Math.min(lines.length - 1, hunkEnd + contextLines)

    // Clamp context to not include conflict markers from adjacent hunks
    const contextBeforeLines: Array<string> = []
    for (let j = markerStart - 1; j >= contextStart; j--) {
      if (isConflictMarker(lines[j])) {
        break
      }
      contextBeforeLines.unshift(lines[j])
    }

    const contextAfterLines: Array<string> = []
    for (let j = hunkEnd + 1; j <= contextEnd; j++) {
      if (isConflictMarker(lines[j])) {
        break
      }
      contextAfterLines.push(lines[j])
    }

    const contextBefore = contextBeforeLines.join('\n')
    const contextAfter = contextAfterLines.join('\n')

    hunks.push({
      oursContent: oursLines.join('\n'),
      theirsContent: theirsLines.join('\n'),
      baseContent: hasBase ? baseLines.join('\n') : null,
      contextBefore,
      contextAfter,
    })
  }

  return hunks
}

/**
 * Gather commit messages from both sides of the merge to provide intent
 * context for conflict resolution.
 *
 * Uses getMergeBase() to find the common ancestor, then getCommits() to
 * retrieve recent commits on each side since the divergence point.
 *
 * Best-effort: returns null if the merge base cannot be determined.
 */
export async function gatherCommitContext(
  repository: Repository,
  ourBranch: string,
  theirBranch: string,
  limit: number = 10
): Promise<IConflictCommitContext | null> {
  try {
    const mergeBase = await getMergeBase(repository, ourBranch, theirBranch)
    if (mergeBase === null) {
      return null
    }

    const [ourCommits, theirCommits] = await Promise.all([
      getCommits(repository, `${mergeBase}..${ourBranch}`, limit, undefined, [
        '--first-parent',
      ]),
      getCommits(repository, `${mergeBase}..${theirBranch}`, limit, undefined, [
        '--first-parent',
      ]),
    ])

    return { ourCommits, theirCommits }
  } catch {
    return null
  }
}

/**
 * Build the full conflict context for a merge, rebase, or cherry-pick.
 *
 * Reads each conflicted file from disk, extracts conflict hunks, and
 * assembles the context into a structured format suitable for sending
 * to the Copilot SDK.
 *
 * @param ourLabel - Label for the current side (e.g., branch name)
 * @param theirLabel - Label for the incoming side (e.g., branch name
 *                     or commit summary for rebase/cherry-pick)
 * @param workingDirectory - Absolute path to the repository working directory
 * @param files - List of conflicted file paths (repository-relative)
 * @returns The assembled conflict context
 */
export async function buildConflictContext(
  ourLabel: string,
  theirLabel: string,
  workingDirectory: string,
  files: ReadonlyArray<{ readonly path: string }>
): Promise<ICopilotConflictContext> {
  const results = await Promise.all(
    files.map(async (file): Promise<IFileConflictContext> => {
      // Guard against path traversal and symlink escapes (cross-platform)
      let absolutePath: string | null
      try {
        absolutePath = await resolveWithin(workingDirectory, file.path)
      } catch {
        return {
          path: file.path,
          hunks: [],
          skippedReason: 'File path could not be resolved safely',
        }
      }
      if (absolutePath === null) {
        return {
          path: file.path,
          hunks: [],
          skippedReason: 'File path is outside the repository',
        }
      }

      // Check file size before reading to avoid loading huge files into memory
      try {
        const fileStat = await stat(absolutePath)
        if (fileStat.size > MAX_CONFLICT_FILE_SIZE) {
          return {
            path: file.path,
            hunks: [],
            skippedReason: 'File exceeds 1MB size limit',
          }
        }
      } catch {
        return {
          path: file.path,
          hunks: [],
          skippedReason: 'File could not be read',
        }
      }

      let content: string
      try {
        content = await readFile(absolutePath, 'utf8')
      } catch {
        return {
          path: file.path,
          hunks: [],
          skippedReason: 'File could not be read',
        }
      }

      const hunks = extractConflictHunks(content)
      if (hunks.length === 0) {
        return {
          path: file.path,
          hunks: [],
          skippedReason: 'No conflict markers found',
        }
      }

      return { path: file.path, hunks }
    })
  )

  return {
    ourLabel,
    theirLabel,
    files: results,
  }
}

/**
 * Convert a structured conflict context into a human-readable prompt
 * string suitable for sending to the Copilot SDK as a user message.
 *
 * @param context - The structured conflict context to format
 * @param commitContext - Optional commit history from both sides
 * @param pullRequest - Optional pull request associated with the merge
 * @returns A formatted string describing the merge conflicts
 */
export function formatConflictContextForPrompt(
  context: ICopilotConflictContext,
  commitContext?: IConflictCommitContext | null,
  pullRequest?: PullRequest | null
): string {
  const parts: Array<string> = []

  parts.push(
    `Merge conflict between "${context.ourLabel}" (ours) and "${context.theirLabel}" (theirs).`
  )
  parts.push('')

  if (pullRequest) {
    parts.push('## Pull Request Context')
    parts.push(`PR #${pullRequest.pullRequestNumber}: ${pullRequest.title}`)
    parts.push('')
    if (pullRequest.body) {
      parts.push('Description:')
      parts.push(makeFencedBlock(pullRequest.body))
      parts.push('')
    }
  }

  if (
    commitContext &&
    (commitContext.ourCommits.length > 0 ||
      commitContext.theirCommits.length > 0)
  ) {
    parts.push('## Recent Commits')
    parts.push('')

    if (commitContext.ourCommits.length > 0) {
      parts.push(`### Ours (${context.ourLabel}) commits:`)
      for (const commit of commitContext.ourCommits) {
        parts.push(`- ${commit.shortSha}: ${commit.summary}`)
      }
      parts.push('')
    }

    if (commitContext.theirCommits.length > 0) {
      parts.push(`### Theirs (${context.theirLabel}) commits:`)
      for (const commit of commitContext.theirCommits) {
        parts.push(`- ${commit.shortSha}: ${commit.summary}`)
      }
      parts.push('')
    }
  }

  for (const file of context.files) {
    const safePath = sanitizeForMarkdown(file.path)
    parts.push(`## File: ${safePath}`)
    parts.push('')

    if (file.skippedReason) {
      parts.push(`> ⚠️ Skipped: ${file.skippedReason}`)
      parts.push('')
      continue
    }

    const lang = getLangFromPath(file.path)

    for (let i = 0; i < file.hunks.length; i++) {
      const hunk = file.hunks[i]
      parts.push(`### Conflict ${i + 1} of ${file.hunks.length}`)
      parts.push('')

      if (hunk.contextBefore) {
        parts.push('Context before:')
        parts.push(makeFencedBlock(hunk.contextBefore, lang))
        parts.push('')
      }

      parts.push('Ours (current branch):')
      parts.push(makeFencedBlock(hunk.oursContent, lang))
      parts.push('')

      if (hunk.baseContent !== null) {
        parts.push('Base (common ancestor):')
        parts.push(makeFencedBlock(hunk.baseContent, lang))
        parts.push('')
      }

      parts.push('Theirs (incoming branch):')
      parts.push(makeFencedBlock(hunk.theirsContent, lang))
      parts.push('')

      if (hunk.contextAfter) {
        parts.push('Context after:')
        parts.push(makeFencedBlock(hunk.contextAfter, lang))
        parts.push('')
      }
    }
  }

  return parts.join('\n')
}

/** Extract a language identifier from a file path for use in code fences. */
function getLangFromPath(filePath: string): string {
  const ext = extname(filePath)
  const lang = ext.startsWith('.') ? ext.slice(1) : ''
  // Only allow safe alphanumeric language tags
  return /^[a-zA-Z0-9]+$/.test(lang) ? lang : ''
}

/**
 * Wrap content in a fenced code block using a delimiter long enough
 * to avoid breaking if the content itself contains backticks.
 */
function makeFencedBlock(content: string, lang: string = ''): string {
  let maxRun = 2
  const runs = content.match(/`+/g)
  if (runs) {
    for (const run of runs) {
      if (run.length > maxRun) {
        maxRun = run.length
      }
    }
  }
  const fence = '`'.repeat(Math.max(3, maxRun + 1))
  return `${fence}${lang}\n${content}\n${fence}`
}

/** Strip characters that could break markdown structure when used in headings/labels. */
function sanitizeForMarkdown(text: string): string {
  return text.replace(/[\r\n`]/g, '')
}
