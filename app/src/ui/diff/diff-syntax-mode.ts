import { DiffHunk, DiffLine } from '../../models/diff'
import * as CodeMirror from 'codemirror'
import { diffLineForIndex } from './diff-explorer'
import { ITokens } from '../../lib/highlighter/types'

import 'codemirror/mode/javascript/javascript'

export interface IDiffSyntaxModeOptions {
  /**
   * The unified diff representing the change
   */
  readonly hunks: ReadonlyArray<DiffHunk>

  /**
   * Tokens returned from the highlighter for the 'before'
   * version of the change
   */
  readonly oldTokens: ITokens

  /**
   * Tokens returned from the highlighter for the 'after'
   * version of the change
   */
  readonly newTokens: ITokens
}

export interface IDiffSyntaxModeSpec extends IDiffSyntaxModeOptions {
  readonly name: 'github-diff-syntax'
}

const TokenNames: { [key: string]: string | null } = {
  '+': 'diff-add',
  '-': 'diff-delete',
  '@': 'diff-hunk',
  ' ': 'diff-context',
}

interface IState {
  diffLineIndex: number
}

function skipLine(stream: CodeMirror.StringStream, state: IState) {
  stream.skipToEnd()
  state.diffLineIndex++
  return null
}

/**
 * Attempt to get tokens for a particular diff line. This will attempt
 * to look up tokens in both the old tokens and the new which is
 * important because for context lines we might only have tokens in
 * one version and we need to be resilient about that.
 */
export function getTokensForDiffLine(
  diffLine: DiffLine,
  oldTokens: ITokens | undefined,
  newTokens: ITokens | undefined
) {
  const oldTokensResult = getTokens(diffLine.oldLineNumber, oldTokens)

  if (oldTokensResult !== null) {
    return oldTokensResult
  }

  return getTokens(diffLine.newLineNumber, newTokens)
}

/**
 * Attempt to get tokens for a particular diff line. This will attempt
 * to look up tokens in both the old tokens and the new which is
 * important because for context lines we might only have tokens in
 * one version and we need to be resilient about that.
 */
export function getTokens(
  lineNumber: number | null,
  tokens: ITokens | undefined
) {
  // Note: Diff lines numbers start at one so we adjust this in order
  // to get the line _index_ in the before or after file contents.
  if (
    tokens !== undefined &&
    lineNumber !== null &&
    tokens[lineNumber - 1] !== undefined
  ) {
    return tokens[lineNumber - 1]
  }

  return null
}

export class DiffSyntaxMode {
  public static readonly ModeName = 'github-diff-syntax'

  private readonly hunks?: ReadonlyArray<DiffHunk>
  private readonly oldTokens?: ITokens
  private readonly newTokens?: ITokens

  public constructor(
    hunks?: ReadonlyArray<DiffHunk>,
    oldTokens?: ITokens,
    newTokens?: ITokens
  ) {
    this.hunks = hunks
    this.oldTokens = oldTokens
    this.newTokens = newTokens
  }

  public startState(): IState {
    return { diffLineIndex: 0 }
  }

  // Should never happen except for blank diffs but
  // let's play along
  public blankLine(state: IState) {
    state.diffLineIndex++
  }

  public token = (
    stream: CodeMirror.StringStream,
    state: IState
  ): string | null => {
    // The first character of a line in a diff is always going to
    // be the diff line marker so we always take care of that first.
    if (stream.sol()) {
      const index = stream.next()

      if (stream.eol()) {
        state.diffLineIndex++
      }

      const token = index ? TokenNames[index] : null

      return token ? `line-${token} line-background-${token}` : null
    }

    // This happens when the mode is running without tokens, in this
    // case there's really nothing more for us to do than what we've
    // already done above to deal with the diff line marker.
    if (this.hunks == null) {
      return skipLine(stream, state)
    }

    const diffLine = diffLineForIndex(this.hunks, state.diffLineIndex)

    if (!diffLine) {
      return skipLine(stream, state)
    }

    const lineTokens = getTokensForDiffLine(
      diffLine,
      this.oldTokens,
      this.newTokens
    )

    if (!lineTokens) {
      return skipLine(stream, state)
    }

    // -1 because the diff line that we're looking at is always prefixed
    // by +, -, @ or space depending on the type of diff line. Those markers
    // are obviously not present in the before/after version.
    const token = lineTokens[stream.pos - stream.lineStart - 1]

    if (!token) {
      // There's no token at the current position so let's skip ahead
      // until we find one or we hit the end of the line. Note that we
      // don't have to worry about already being at the end of the line
      // as it's a requirement for modes to always advance the stream. In
      // other words, CodeMirror will never give us a stream already at
      // the end of a line.
      do {
        stream.pos++
      } while (!stream.eol() && !lineTokens[stream.pos - stream.lineStart - 1])
    } else {
      stream.pos += token.length
    }

    if (stream.eol()) {
      state.diffLineIndex++
    }

    return token ? token.token : null
  }
}

CodeMirror.defineMode(DiffSyntaxMode.ModeName, function (
  config: CodeMirror.EditorConfiguration,
  modeOptions?: IDiffSyntaxModeOptions
) {
  if (!modeOptions) {
    throw new Error('I needs me some options')
  }

  return new DiffSyntaxMode(
    modeOptions.hunks,
    modeOptions.oldTokens,
    modeOptions.newTokens
  )
})
