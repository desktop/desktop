import { ITextDiff, DiffLineType } from '../../models/diff'
import * as CodeMirror from 'codemirror'
import { diffLineForIndex } from './diff-explorer'
import { ITokens } from '../../lib/tokens'

require('codemirror/mode/javascript/javascript')

interface IDiffSyntaxModeOptions {
  readonly diff: ITextDiff
  readonly oldTokens: ITokens
  readonly newTokens: ITokens
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

export class DiffSyntaxMode {
  public static readonly ModeName = 'github-diff-syntax'

  private readonly config: CodeMirror.EditorConfiguration
  private readonly diff?: ITextDiff
  private readonly oldTokens?: ITokens
  private readonly newTokens?: ITokens

  public constructor(
    config: CodeMirror.EditorConfiguration,
    diff?: ITextDiff,
    oldTokens?: ITokens,
    newTokens?: ITokens
  ) {
    this.config = config
    this.diff = diff
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
    if (stream.sol()) {
      const index = stream.next()

      if (stream.eol()) {
        state.diffLineIndex++
      }

      if (!index) {
        return null
      }

      const token = TokenNames[index]

      if (!token) {
        return null
      }

      return `line-${token} line-background-${token}`
    }

    if (!this.diff) {
      return skipLine(stream, state)
    }

    const diffLine = diffLineForIndex(this.diff, state.diffLineIndex)

    if (!diffLine || diffLine.type === DiffLineType.Hunk) {
      return skipLine(stream, state)
    }

    let diffLineNumber =
      diffLine.oldLineNumber !== null
        ? diffLine.oldLineNumber
        : diffLine.newLineNumber

    if (diffLineNumber === null) {
      return skipLine(stream, state)
    }

    const activeTokens =
      diffLine.oldLineNumber !== null ? this.oldTokens : this.newTokens

    // Diffs use off-by-one indexing
    diffLineNumber--

    if (!activeTokens) {
      return skipLine(stream, state)
    }

    const lineTokens = activeTokens[diffLineNumber]

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

CodeMirror.defineMode(DiffSyntaxMode.ModeName, function(
  config: CodeMirror.EditorConfiguration,
  modeOptions?: IDiffSyntaxModeOptions
) {
  if (!modeOptions) {
    throw new Error('I needs me some options')
  }

  return new DiffSyntaxMode(
    config,
    modeOptions.diff,
    modeOptions.oldTokens,
    modeOptions.newTokens
  )
})
