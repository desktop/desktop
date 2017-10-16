import { ITextDiff, DiffLineType } from '../../models/diff'
import * as CodeMirror from 'codemirror'
import { diffLineForIndex } from './diff-explorer'

require('codemirror/mode/javascript/javascript')

interface IToken {
  length: number
  text: string
  token: string
}

type Tokens = { [line: number]: { [startIndex: number]: IToken } }

interface IDiffSyntaxModeOptions {
  readonly diff: ITextDiff
  readonly oldTokens: Tokens
  readonly newTokens: Tokens
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

export class DiffSyntaxMode {
  public static readonly ModeName = 'github-diff-syntax'

  private readonly config: CodeMirror.EditorConfiguration
  private readonly diff?: ITextDiff
  private readonly oldTokens?: Tokens
  private readonly newTokens?: Tokens

  public constructor(
    config: CodeMirror.EditorConfiguration,
    diff?: ITextDiff,
    oldTokens?: Tokens,
    newTokens?: Tokens
  ) {
    this.config = config
    this.diff = diff
    this.oldTokens = oldTokens
    this.newTokens = newTokens

    if (oldTokens && newTokens) {
      console.log('old', oldTokens)
      console.log('new', newTokens)
    }
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
      stream.skipToEnd()
      state.diffLineIndex++
      return null
    }

    const diffLine = diffLineForIndex(this.diff, state.diffLineIndex)

    if (!diffLine || diffLine.type === DiffLineType.Hunk) {
      stream.skipToEnd()
      state.diffLineIndex++
      return null
    }

    let diffLineNumber =
      diffLine.oldLineNumber !== null
        ? diffLine.oldLineNumber
        : diffLine.newLineNumber

    if (diffLineNumber === null) {
      stream.skipToEnd()
      state.diffLineIndex++
      return null
    }

    const activeTokens =
      diffLine.oldLineNumber !== null ? this.oldTokens : this.newTokens

    // Diffs use off-by-one indexing
    diffLineNumber--

    if (!activeTokens) {
      stream.skipToEnd()
      state.diffLineIndex++
      return null
    }

    const lineTokens = activeTokens[diffLineNumber]

    if (!lineTokens) {
      stream.skipToEnd()
      state.diffLineIndex++
      return null
    }

    const token = lineTokens[stream.pos - stream.lineStart - 1]

    if (!token) {
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
