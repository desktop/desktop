import isPlainObject from 'lodash/isPlainObject'

import {
  IConflictContextCommit,
  IConflictContextPullRequest,
  IConflictResolutionContext,
  IFileConflictContext,
} from './copilot-conflict-context'

// ---------------------------------------------------------------------------
// Types & interfaces
// ---------------------------------------------------------------------------

/** Resolution suggestion for a single conflicted file. */
export interface IFileResolution {
  /** Repository-relative file path that was resolved. */
  readonly path: string
  /** The fully resolved file content (all conflict markers removed). */
  readonly resolvedContent: string
  /** Human-readable explanation of how and why conflicts were resolved this way. */
  readonly reasoning: string
}

/** Resolution for a single conflict hunk as returned by the model. */
export interface IHunkResolution {
  /** The resolved content that replaces the conflict marker block. */
  readonly resolvedContent: string
}

/** Per-file resolution from the model's raw response (before reassembly). */
export interface IRawFileResolution {
  /** Repository-relative file path. */
  readonly path: string
  /** Resolved content for each conflict hunk, in order. */
  readonly hunks: ReadonlyArray<IHunkResolution>
  /** Human-readable explanation of the resolution strategy for this file. */
  readonly reasoning: string
}

/** A reference the model considered material to its decision. */
export interface ICopilotConflictReference {
  /** Discriminant: pull request or commit. */
  readonly type: 'pullRequest' | 'commit'
  /**
   * Identifier for the reference. For pull requests this is the decimal
   * pull-request number (no leading `#`). For commits this is a short or
   * full SHA in hex.
   */
  readonly id: string
}

/** Complete response from Copilot conflict resolution (raw model output). */
export interface ICopilotConflictResolutionResponse {
  /** Per-file resolution with per-hunk resolved content (before reassembly). */
  readonly resolutions: ReadonlyArray<IRawFileResolution>
  /**
   * Optional markdown summary of the conflict and the resolution strategy.
   * The system prompt requires the model to include exactly two `###`
   * headings — `### Conflicting changes` and `### Resolution` — but a
   * missing or malformed value is *not* treated as a fatal error so we
   * preserve the existing happy path.
   */
  readonly summary: string | null
  /**
   * Pull requests and commits the model considered material to its
   * decision. May be empty when the model omitted the field or none of
   * its references resolve.
   */
  readonly references: ReadonlyArray<ICopilotConflictReference>
}

/**
 * The conflict resolution response after reassembly — per-file resolutions
 * contain the complete reassembled file content. This is what the rest of
 * the app (UI, write path) consumes.
 */
export interface IReassembledConflictResolutionResponse {
  /** Reassembled per-file resolutions with full file content. */
  readonly resolutions: ReadonlyArray<IFileResolution>
  /** Optional markdown summary (passed through from model). */
  readonly summary: string | null
  /** Structured references (passed through from model). */
  readonly references: ReadonlyArray<ICopilotConflictReference>
}

/**
 * A reference the model cited, resolved against the gathered context so
 * the dialog can render a real title and link. Because the model can
 * only ever cite data we placed in the prompt (its session has no tools),
 * every rendered reference is one of the entries we already gathered.
 */
export type IConflictContextReference =
  | {
      readonly kind: 'pullRequest'
      readonly pullRequest: IConflictContextPullRequest
    }
  | {
      readonly kind: 'commit'
      readonly commit: IConflictContextCommit
    }

/**
 * The full set of context needed to render the resolution-summary card in
 * the conflict resolution dialog. Bundled together so we capture it once
 * while the data is fresh and hand it to the dialog as a single prop.
 */
export interface ICopilotResolutionSummary {
  /** Markdown text written by Copilot. Null when the model omitted it. */
  readonly markdown: string | null
  /** Display label for the *ours* (current) side. */
  readonly ourLabel: string
  /** Display label for the *theirs* (incoming) side. */
  readonly theirLabel: string
  /**
   * Curated list of references the model used when making its decision,
   * resolved against the gathered context. The dialog renders these as
   * the "Context" list.
   */
  readonly references: ReadonlyArray<IConflictContextReference>
}

/** Progress information emitted during conflict resolution. */
export interface IConflictResolutionProgress {
  readonly filesResolved: number
  readonly filesTotal: number
  /**
   * A short snippet of the model's live reasoning, when streaming.
   * Surfaced to the UI sentence-by-sentence so the user can see what
   * Copilot is currently thinking about.
   */
  readonly reasoningSnippet?: string
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

/**
 * Error subclass for parse and validation failures from Copilot responses.
 * Used to distinguish retryable errors (bad LLM output) from transport
 * errors (timeouts, auth, session creation) which should fail fast.
 */
export class CopilotValidationError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'CopilotValidationError'
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Maximum number of files to resolve in a single prompt. When the total
 * exceeds this threshold, the engine batches files into parallel chunks.
 */
export const SinglePromptFileLimit = 20

/** Maximum number of chunks to resolve concurrently. */
export const MaxConcurrentChunks = 5

/**
 * System prompt for the Copilot conflict resolution session.
 */
export const ConflictResolutionSystemPrompt = `
Respond ONLY with valid JSON in the format specified below. Do NOT use tools.

You are an expert Git conflict resolver. Analyze conflicts from merge, rebase, or cherry-pick operations and produce correct, clean resolutions.

You will receive:
- Labels for both sides (branch names or commit refs)
- Conflict markers from each file (ours, theirs, optionally base)
- Context lines surrounding each conflict
- When available: recent commit messages and/or PR title/description for intent

Your job:
1. Understand the INTENT behind each side's changes
2. Resolve each conflict by producing the correct merged content for each conflict hunk
3. Explain your reasoning per file — terse but specific enough to verify the decision
4. Produce a brief markdown summary orienting the user to the conflict and resolution

Resolution guidelines:
- Make MINIMAL changes — do not refactor, reformat, or alter code outside conflicted regions
- When both sides add complementary code (e.g., different imports), combine them
- When both sides modify the same code differently, use commit messages and PR context to decide
- When one side deletes code the other modifies, check whether the content was relocated rather than simply removed — accept the deletion only when it was intentional
- When conflicts involve dependency manifests or lock files, ensure version constraints and entries remain consistent across the resolved file
- Preserve correctness: imports, types, formatting must remain valid
- When in doubt, prefer backward compatibility

Response format:
{
  "summary": "### Conflicting changes\\n<1-2 sentences: what each side did and where they collided, attributing each to its #PR or short SHA>\\n\\n### Resolution\\n<1 sentence: how you resolved it; if a side was dropped, bold that trade-off>",
  "references": [
    { "type": "pullRequest", "id": "1234" },
    { "type": "commit", "id": "abc1234" }
  ],
  "resolutions": [
    {
      "path": "relative/file/path.ts",
      "hunks": [
        { "resolvedContent": "merged content that replaces conflict 1" },
        { "resolvedContent": "merged content that replaces conflict 2" }
      ],
      "reasoning": "What each side changed in this file, what you kept, and what you dropped or overrode."
    }
  ]
}

Field rules:

hunks: An ordered array with one entry per conflict in the file, matching the "Conflict 1 of N", "Conflict 2 of N" order from the input. Each entry's resolvedContent is ONLY the merged content that replaces that specific conflict marker block (the region between <<<<<<< and >>>>>>>). Do NOT include surrounding non-conflicted code — the application splices each resolution into the original file automatically. If the resolution is to accept one side entirely, return that side's content verbatim. For an intentional deletion, use an empty string.

reasoning: Terse, direct prose — enough detail to verify the decision, not a wall of text. State what each side did in this file, what you kept, and any trade-off. Typically 1-4 sentences depending on complexity.

summary: A markdown banner with exactly two ### headings ("Conflicting changes" then "Resolution"). Write natural prose a developer would say to a teammate. Be brief — per-file detail belongs in reasoning, not here. When many files conflicted, summarize them ("several menu components") rather than listing each. Refer to PRs as "#1234" and commits as short SHAs (no URLs — the app linkifies them). Do not address the user as "you"; write "the current branch". Bold any trade-off where one side's change was dropped.

references: The PRs and commits a reader would open to understand the conflict. Include every genuinely informative one — skip merge commits, WIP/fixup/squash commits, and low-signal messages. "type" is "pullRequest" or "commit"; "id" is the PR number (no #) or hex SHA. Cite the PR instead of its squash-merge commit when both exist. Return an empty array only when no PRs or commits exist in context.
`

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

/**
 * Normalize a file path returned by the LLM. The model may return
 * Windows-style backslashes (`src\\file.ts`), a leading `./`, or redundant
 * separators — all of which would cause validation to reject an otherwise
 * correct resolution.
 */
function normalizeLLMPath(raw: string): string {
  return raw
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/\/+/g, '/')
}

/**
 * Parse the raw string response from the Copilot SDK into a structured
 * conflict resolution response.
 *
 * Handles markdown code-block wrapping (` ```json ... ``` `) and validates
 * all required fields.
 */
export function parseCopilotConflictResolution(
  content: string
): ICopilotConflictResolutionResponse {
  // Build a list of JSON candidates from the response, trying different
  // extraction strategies. Non-greedy handles the common single-block and
  // multi-block cases. Greedy handles triple backticks embedded inside JSON
  // content. Raw content handles responses with no fences at all.
  const nonGreedy =
    content.match(/```json\s*([\s\S]*?)```/) ||
    content.match(/```\s*([\s\S]*?)```/)
  const greedy =
    content.match(/```json\s*([\s\S]*)```/) ||
    content.match(/```\s*([\s\S]*)```/)

  const candidates: Array<string> = []
  if (nonGreedy) {
    candidates.push(nonGreedy[1].trim())
  }
  if (greedy && greedy[1].trim() !== nonGreedy?.[1]?.trim()) {
    candidates.push(greedy[1].trim())
  }
  candidates.push(content.trim())

  let parsed: unknown
  let parseError: Error | undefined
  for (const candidate of candidates) {
    try {
      parsed = JSON.parse(candidate)
      parseError = undefined
      break
    } catch {
      parseError = new CopilotValidationError(
        'Copilot returned invalid JSON for conflict resolution generation'
      )
    }
  }
  if (parseError) {
    throw parseError
  }

  if (!isPlainObject(parsed)) {
    throw new CopilotValidationError(
      'Copilot returned an invalid conflict resolution payload: expected an object'
    )
  }

  const obj = parsed as Record<string, unknown>
  const { resolutions, summary: rawSummary, references: rawReferences } = obj

  if (!Array.isArray(resolutions)) {
    throw new CopilotValidationError(
      'Copilot returned an invalid conflict resolution payload: "resolutions" must be an array'
    )
  }

  if (resolutions.length === 0) {
    throw new CopilotValidationError(
      'Copilot returned an invalid conflict resolution payload: "resolutions" must not be empty'
    )
  }

  // Soft-fail summary: it's a nice-to-have, not a critical part of the
  // contract. If the model omits it or returns the wrong shape we still
  // ship a usable resolution.
  const summary =
    typeof rawSummary === 'string' && rawSummary.trim().length > 0
      ? rawSummary
      : null

  // Soft-fail references the same way. Drop any entry whose shape we don't
  // recognize; never throw — a curated context list is a polish, not a
  // gate on shipping resolutions.
  const references: Array<ICopilotConflictReference> = []
  if (Array.isArray(rawReferences)) {
    for (const entry of rawReferences) {
      if (!isPlainObject(entry)) {
        continue
      }
      const { type, id } = entry as Record<string, unknown>
      if (type !== 'pullRequest' && type !== 'commit') {
        continue
      }
      if (typeof id !== 'string' || id.trim().length === 0) {
        continue
      }
      const trimmed = id.trim().replace(/^#/, '')
      if (type === 'pullRequest' && !/^\d{1,9}$/.test(trimmed)) {
        continue
      }
      if (type === 'commit' && !/^[0-9a-f]{4,40}$/i.test(trimmed)) {
        continue
      }
      references.push({ type, id: trimmed })
    }
  }

  const validated: Array<IRawFileResolution> = []

  for (let i = 0; i < resolutions.length; i++) {
    const entry: unknown = resolutions[i]

    if (!isPlainObject(entry)) {
      throw new CopilotValidationError(
        `Copilot returned an invalid conflict resolution payload: resolution at index ${i} must be an object`
      )
    }

    const obj = entry as Record<string, unknown>
    const { path, hunks: rawHunks, reasoning } = obj

    if (typeof path !== 'string' || path.trim().length === 0) {
      throw new CopilotValidationError(
        `Copilot returned an invalid conflict resolution payload: "path" at index ${i} must be a non-empty string`
      )
    }

    if (!Array.isArray(rawHunks)) {
      throw new CopilotValidationError(
        `Copilot returned an invalid conflict resolution payload: "hunks" at index ${i} must be an array`
      )
    }

    if (rawHunks.length === 0) {
      throw new CopilotValidationError(
        `Copilot returned an invalid conflict resolution payload: "hunks" at index ${i} must not be empty`
      )
    }

    const validatedHunks: Array<IHunkResolution> = []
    for (let j = 0; j < rawHunks.length; j++) {
      const hunkEntry: unknown = rawHunks[j]
      if (!isPlainObject(hunkEntry)) {
        throw new CopilotValidationError(
          `Copilot returned an invalid conflict resolution payload: hunk at index ${j} of file "${path}" must be an object`
        )
      }
      const hunkObj = hunkEntry as Record<string, unknown>
      if (typeof hunkObj.resolvedContent !== 'string') {
        throw new CopilotValidationError(
          `Copilot returned an invalid conflict resolution payload: "resolvedContent" at hunk ${j} of file "${path}" must be a string`
        )
      }
      const rc = hunkObj.resolvedContent
      if (/^<{7}\s/m.test(rc) && /^={7}$/m.test(rc)) {
        throw new CopilotValidationError(
          `Copilot returned an invalid conflict resolution payload: hunk ${j} of file "${path}" still contains conflict markers`
        )
      }
      validatedHunks.push({ resolvedContent: rc })
    }

    if (typeof reasoning !== 'string' || reasoning.trim().length === 0) {
      throw new CopilotValidationError(
        `Copilot returned an invalid conflict resolution payload: "reasoning" at index ${i} must be a non-empty string`
      )
    }

    validated.push({
      path: normalizeLLMPath(path),
      hunks: validatedHunks,
      reasoning,
    })
  }

  return { resolutions: validated, summary, references }
}

/**
 * Validate that a parsed resolution response matches the expected set of
 * file paths and hunk counts. Throws CopilotValidationError on unexpected
 * paths, duplicates, missing files, or wrong hunk counts.
 */
export function validateResolutionPaths(
  resolutions: ReadonlyArray<IRawFileResolution>,
  expectedFiles: ReadonlyArray<IFileConflictContext>
): void {
  const expectedPaths = new Set(expectedFiles.map(f => f.path))
  const expectedHunkCounts = new Map(
    expectedFiles.map(f => [f.path, f.hunks.length])
  )
  const returnedPaths = new Set(resolutions.map(r => r.path))

  for (const path of returnedPaths) {
    if (!expectedPaths.has(path)) {
      throw new CopilotValidationError(
        `Copilot returned resolution for unexpected file: ${path}`
      )
    }
  }

  if (returnedPaths.size !== resolutions.length) {
    throw new CopilotValidationError(
      'Copilot returned duplicate file paths in resolutions'
    )
  }

  const missingPaths: Array<string> = []
  for (const path of expectedPaths) {
    if (!returnedPaths.has(path)) {
      missingPaths.push(path)
    }
  }
  if (missingPaths.length > 0) {
    throw new CopilotValidationError(
      `Copilot did not return resolutions for: ${missingPaths.join(', ')}`
    )
  }

  for (const resolution of resolutions) {
    const expectedCount = expectedHunkCounts.get(resolution.path) ?? 0
    if (resolution.hunks.length !== expectedCount) {
      throw new CopilotValidationError(
        `Copilot returned ${resolution.hunks.length} hunk(s) for "${resolution.path}" but expected ${expectedCount}`
      )
    }
  }
}

// Conflict markers used by reassembleResolvedFile to locate marker blocks.
const reassemblyOursMarker = /^<{7}(?:\s|$)/
const reassemblySeparatorMarker = /^={7}$/
const reassemblyTheirsMarker = /^>{7}(?:\s|$)/

/**
 * Reassemble a fully resolved file by splicing per-hunk resolutions into
 * the original file content (which still has conflict markers on disk).
 *
 * Walks the original file line-by-line. Non-conflicted lines are copied
 * through verbatim. Each conflict marker block (`<<<<<<<` through
 * `>>>>>>>`, with a `=======` separator in between) is replaced with the
 * corresponding entry from `hunkResolutions` (matched by order, not by
 * line number). This guarantees that all non-conflicted code is preserved
 * exactly, and the model's output is only responsible for the small
 * resolved sections.
 *
 * A `<<<<<<<` line that is not followed by both a `=======` separator and
 * a closing `>>>>>>>` before EOF is treated as regular file content (not a
 * conflict block) and copied through unchanged to avoid data loss from
 * malformed or stray markers.
 *
 * @param rawContent - The full file content on disk, including conflict markers
 * @param hunkResolutions - Per-hunk resolved content, in the order they appear in the file
 * @returns The reassembled file with all conflicts resolved
 */
export function reassembleResolvedFile(
  rawContent: string,
  hunkResolutions: ReadonlyArray<IHunkResolution>
): string {
  const eol = rawContent.includes('\r\n') ? '\r\n' : '\n'
  const lines = rawContent.split(/\r?\n/)
  const resultLines: Array<string> = []
  let hunkIndex = 0
  let i = 0

  while (i < lines.length) {
    if (reassemblyOursMarker.test(lines[i])) {
      // Look ahead to verify this is a well-formed conflict block:
      // must have a ======= separator and a >>>>>>> closing marker.
      let hasSeparator = false
      let closingIndex = -1
      for (let j = i + 1; j < lines.length; j++) {
        if (reassemblySeparatorMarker.test(lines[j])) {
          hasSeparator = true
        } else if (reassemblyTheirsMarker.test(lines[j])) {
          closingIndex = j
          break
        }
      }

      if (!hasSeparator || closingIndex === -1) {
        // Malformed marker — copy through as regular content
        resultLines.push(lines[i])
        i++
        continue
      }

      // Skip through the entire conflict marker block
      i = closingIndex + 1

      // Splice in the resolved content for this hunk
      if (hunkIndex < hunkResolutions.length) {
        const resolved = hunkResolutions[hunkIndex].resolvedContent
        if (resolved.length > 0) {
          resultLines.push(...resolved.split(/\r?\n/))
        }
      }
      hunkIndex++
    } else {
      resultLines.push(lines[i])
      i++
    }
  }

  return resultLines.join(eol)
}

/**
 * Combine raw per-hunk model resolutions with original file contexts to
 * produce the final {@link IFileResolution} array that the rest of the app
 * expects (each entry has the complete reassembled file content).
 *
 * This is the bridge between the model's lightweight per-hunk output and
 * the existing UI and write path which need full file content.
 */
export function reassembleResolutions(
  rawResolutions: ReadonlyArray<IRawFileResolution>,
  fileContexts: ReadonlyArray<IFileConflictContext>
): ReadonlyArray<IFileResolution> {
  const contextByPath = new Map(fileContexts.map(f => [f.path, f]))

  return rawResolutions.map(raw => {
    const ctx = contextByPath.get(raw.path)
    if (ctx?.rawContent === undefined) {
      throw new CopilotValidationError(
        `Cannot reassemble resolution for "${raw.path}": original file content is unavailable`
      )
    }

    const resolvedContent = reassembleResolvedFile(ctx.rawContent, raw.hunks)
    return {
      path: raw.path,
      resolvedContent,
      reasoning: raw.reasoning,
    }
  })
}

/**
 * Extract a trailing pull-request number from a commit summary, e.g.
 * "Add multilingual greetings (#20)" -> 20. Returns null when no
 * `(#N)` suffix is present.
 */
function extractPullRequestNumberFromCommitSummary(
  summary: string
): number | null {
  const match = /\(#(\d+)\)\s*$/.exec(summary)
  if (match === null) {
    return null
  }
  const n = Number.parseInt(match[1], 10)
  return Number.isFinite(n) ? n : null
}

/** Minimum length required to resolve a commit reference by SHA prefix. */
const MinShaPrefixLength = 7

/**
 * Resolve the model's raw reference list against the gathered context,
 * producing display-ready entries for the dialog's "Context" list.
 *
 * The Copilot session has no tools, so it can only cite data we placed in
 * the prompt — every entry here is therefore one of the PRs or commits we
 * already gathered. References we can't match (a hallucinated or mistyped
 * id) are dropped rather than rendered as placeholders.
 *
 * When the model cites a commit that is itself a squash/merge of a pull
 * request (detected by a trailing `(#N)` in its summary) and we gathered
 * that PR, we surface the PR instead — its title and body carry far more
 * human context than the merge commit. Entries are de-duplicated on their
 * final identity so a PR and its merge commit collapse into one row.
 */
export function selectReferencedContext(
  references: ReadonlyArray<ICopilotConflictReference>,
  context: IConflictResolutionContext
): ReadonlyArray<IConflictContextReference> {
  const prByNumber = new Map<number, IConflictContextPullRequest>()
  for (const pr of context.pullRequests) {
    prByNumber.set(pr.number, pr)
  }

  const commitBySha = new Map<string, IConflictContextCommit>()
  for (const commit of [...context.ourCommits, ...context.theirCommits]) {
    commitBySha.set(commit.sha.toLowerCase(), commit)
  }

  const selected: Array<IConflictContextReference> = []
  const seenPrs = new Set<number>()
  const seenCommits = new Set<string>()

  const pushPullRequest = (prNumber: number): void => {
    if (seenPrs.has(prNumber)) {
      return
    }
    const pr = prByNumber.get(prNumber)
    if (pr === undefined) {
      return
    }
    seenPrs.add(prNumber)
    selected.push({ kind: 'pullRequest', pullRequest: pr })
  }

  for (const ref of references) {
    if (ref.type === 'pullRequest') {
      const prNumber = Number.parseInt(ref.id, 10)
      if (Number.isFinite(prNumber)) {
        pushPullRequest(prNumber)
      }
      continue
    }

    const matched = findCommitByRef(ref.id, commitBySha)
    if (matched === null) {
      continue
    }

    // Promote a merge/squash commit to its pull request when we have it.
    const prFromSummary = extractPullRequestNumberFromCommitSummary(
      matched.summary
    )
    if (prFromSummary !== null && prByNumber.has(prFromSummary)) {
      pushPullRequest(prFromSummary)
      continue
    }

    if (seenCommits.has(matched.sha)) {
      continue
    }
    seenCommits.add(matched.sha)
    selected.push({ kind: 'commit', commit: matched })
  }

  return selected
}

/** Commit summaries that carry no human context worth surfacing. */
const lowSignalCommitSummary = /^(merge |wip\b|fixup!|squash!|amend\b)/i

function isMeaningfulCommit(commit: IConflictContextCommit): boolean {
  const summary = commit.summary.trim()
  return summary.length > 0 && !lowSignalCommitSummary.test(summary)
}

/**
 * Guarantee the "Context" list is never empty when we actually gathered
 * material to show. The model curates references, but it occasionally
 * returns none even though a conflict always traces back to at least one
 * commit. This deterministic floor surfaces the single most informative
 * item we have — preferring a pull request, then a commit with a
 * human-readable message, then any commit as a last resort — and favours
 * the incoming (theirs) side since that is the change being brought in.
 *
 * It is only consulted when {@linkcode selectReferencedContext} yields
 * nothing, so a model that cites real references is never second-guessed.
 */
export function fallbackReferencedContext(
  context: IConflictResolutionContext
): ReadonlyArray<IConflictContextReference> {
  const pr = context.pullRequests.at(0) ?? null
  if (pr !== null) {
    return [{ kind: 'pullRequest', pullRequest: pr }]
  }

  const commit =
    context.theirCommits.find(isMeaningfulCommit) ??
    context.ourCommits.find(isMeaningfulCommit) ??
    context.theirCommits.at(0) ??
    context.ourCommits.at(0) ??
    null
  if (commit !== null) {
    return [{ kind: 'commit', commit }]
  }

  return []
}

/**
 * Resolve a commit reference id (full or abbreviated SHA) against the
 * gathered commits. Prefers an exact match; falls back to a unique prefix
 * match of at least {@linkcode MinShaPrefixLength} characters. Returns
 * null when nothing matches or a short prefix is ambiguous.
 */
function findCommitByRef(
  id: string,
  commitBySha: ReadonlyMap<string, IConflictContextCommit>
): IConflictContextCommit | null {
  const lower = id.toLowerCase()
  const exact = commitBySha.get(lower)
  if (exact !== undefined) {
    return exact
  }

  if (lower.length < MinShaPrefixLength) {
    return null
  }

  let match: IConflictContextCommit | null = null
  for (const [sha, commit] of commitBySha) {
    if (sha.startsWith(lower)) {
      if (match !== null) {
        // Ambiguous prefix — refuse to guess.
        return null
      }
      match = commit
    }
  }
  return match
}

/**
 * Extract exported and imported symbols from conflict hunk content for
 * dependency detection. Scans all hunk sections (ours, theirs, context)
 * to find import paths, exported names, and referenced identifiers.
 */
export function extractSymbols(file: IFileConflictContext): {
  readonly exports: ReadonlySet<string>
  readonly importPaths: ReadonlySet<string>
  readonly references: ReadonlySet<string>
} {
  const exports = new Set<string>()
  const importPaths = new Set<string>()
  const references = new Set<string>()

  const textParts: Array<string> = []
  for (const hunk of file.hunks) {
    textParts.push(
      hunk.oursContent,
      hunk.theirsContent,
      hunk.contextBefore,
      hunk.contextAfter
    )
    if (hunk.baseContent !== null) {
      textParts.push(hunk.baseContent)
    }
  }
  const content = textParts.join('\n')

  for (const m of content.matchAll(
    /export\s+(?:function|const|let|class|interface|type|enum)\s+(\w+)/g
  )) {
    exports.add(m[1])
  }

  // Match all common import forms:
  //   import { a, b } from 'x'
  //   import X from 'x'
  //   import * as X from 'x'
  //   import X, { a, b } from 'x'
  //   import type { a } from 'x'
  for (const m of content.matchAll(
    /import\s+(?:type\s+)?(?:(\*\s+as\s+\w+)|(\w+)\s*,\s*\{([^}]+)\}|\{([^}]+)\}|(\w+))\s+from\s+['"]([^'"]+)['"]/g
  )) {
    // m[6] is always the import path
    importPaths.add(m[6])

    // Collect referenced names from whichever capture group matched
    const parts: Array<string> = []
    if (m[1]) {
      // import * as X — extract X
      const asName = m[1].replace(/^\*\s+as\s+/, '').trim()
      if (asName) {
        parts.push(asName)
      }
    } else if (m[2] && m[3]) {
      // import Default, { named } — both
      parts.push(m[2])
      parts.push(...m[3].split(','))
    } else if (m[4]) {
      // import { named }
      parts.push(...m[4].split(','))
    } else if (m[5]) {
      // import Default
      parts.push(m[5])
    }

    for (const name of parts) {
      const trimmed = name
        .trim()
        .replace(/^type\s+/, '')
        .split(/\s+as\s+/)[0]
        .trim()
      if (trimmed) {
        references.add(trimmed)
      }
    }
  }

  for (const m of content.matchAll(
    /(?:extends|implements|instanceof|new|typeof)\s+(\w+)/g
  )) {
    references.add(m[1])
  }

  return { exports, importPaths, references }
}

/**
 * Group files that share dependencies into clusters using Union-Find,
 * then pack clusters into chunks of `targetSize`. Files that import from
 * each other or reference each other's exports stay in the same chunk
 * so the model can reason about cross-file coherence.
 */
export function createDependencyAwareChunks(
  files: ReadonlyArray<IFileConflictContext>,
  targetSize: number
): ReadonlyArray<ReadonlyArray<IFileConflictContext>> {
  if (files.length <= targetSize) {
    return [Array.from(files)]
  }

  const fileSymbols = files.map(f => ({
    ...extractSymbols(f),
    baseName: f.path.replace(/\.[^.]+$/, '').replace(/^.*\//, ''),
  }))

  // Union-Find
  const parent = new Array<number>(files.length)
  for (let i = 0; i < files.length; i++) {
    parent[i] = i
  }

  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]]
      x = parent[x]
    }
    return x
  }

  function union(a: number, b: number): void {
    const pa = find(a)
    const pb = find(b)
    if (pa !== pb) {
      parent[pa] = pb
    }
  }

  for (let i = 0; i < fileSymbols.length; i++) {
    for (let j = i + 1; j < fileSymbols.length; j++) {
      const a = fileSymbols[i]
      const b = fileSymbols[j]

      // Match import paths by path-segment boundary — not bare substring —
      // to avoid false positives with short basenames like "e" or "api".
      // Strip extension and directory from import path to get its base name.
      const aImportsB = [...a.importPaths].some(
        p => p.replace(/\.[^./]+$/, '').replace(/^.*\//, '') === b.baseName
      )
      const bImportsA = [...b.importPaths].some(
        p => p.replace(/\.[^./]+$/, '').replace(/^.*\//, '') === a.baseName
      )

      const sharedSymbols =
        [...a.exports].some(exp => b.references.has(exp)) ||
        [...b.exports].some(exp => a.references.has(exp))

      if (aImportsB || bImportsA || sharedSymbols) {
        union(i, j)
      }
    }
  }

  // Collect dependency groups
  const groups = new Map<number, Array<IFileConflictContext>>()
  for (let i = 0; i < files.length; i++) {
    const root = find(i)
    let group = groups.get(root)
    if (group === undefined) {
      group = []
      groups.set(root, group)
    }
    group.push(files[i])
  }

  // Pack groups into chunks: large groups get split, small groups bin-pack
  const result: Array<Array<IFileConflictContext>> = []
  let currentBin: Array<IFileConflictContext> = []

  for (const group of groups.values()) {
    if (group.length >= targetSize) {
      if (currentBin.length > 0) {
        result.push(currentBin)
        currentBin = []
      }
      for (let i = 0; i < group.length; i += targetSize) {
        result.push(group.slice(i, i + targetSize))
      }
    } else {
      if (currentBin.length + group.length > targetSize) {
        if (currentBin.length > 0) {
          result.push(currentBin)
        }
        currentBin = [...group]
      } else {
        currentBin.push(...group)
      }
    }
  }

  if (currentBin.length > 0) {
    result.push(currentBin)
  }

  return result
}
