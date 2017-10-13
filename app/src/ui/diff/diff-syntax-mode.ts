import { ITextDiff, DiffLineType } from '../../models/diff'
import * as CodeMirror from 'codemirror'
import { diffLineForIndex } from './diff-explorer'

require('codemirror/mode/javascript/javascript')

interface IDiffSyntaxModeOptions {
  readonly diff: ITextDiff
  readonly oldContents: Buffer
  readonly newContents: Buffer
}

const TokenNames: { [key: string]: string | null } = {
  '+': 'diff-add',
  '-': 'diff-delete',
  '@': 'diff-hunk',
  ' ': 'diff-context',
}

interface IInnerMode {
  readonly mode: CodeMirror.Mode<{}>
  readonly state: any
  readonly contents?: Buffer
  currentLine: number
  currentLineStream?: CodeMirror.StringStream
}

interface IState {
  diffLineIndex: number

  readonly oldMode: IInnerMode
  readonly newMode: IInnerMode
}

function parseUntilLine(
  mode: IInnerMode,
  tabSize: number | undefined,
  line: number,
  lines: string[]
) {
  while (mode.currentLine < line && mode.currentLine <= lines.length) {
    const lineStream =
      mode.currentLineStream ||
      (mode.currentLineStream = new (CodeMirror as any).StringStream(
        lines[mode.currentLine],
        tabSize
      ) as CodeMirror.StringStream)

    while (!lineStream.eol()) {
      mode.mode.token(lineStream, mode.state)
    }

    delete mode.currentLineStream
    mode.currentLine++
  }
}

export class DiffSyntaxMode {
  public static readonly ModeName = 'github-diff-syntax'

  private readonly config: CodeMirror.EditorConfiguration
  private readonly diff?: ITextDiff
  private readonly oldContents?: Buffer
  private readonly newContents?: Buffer

  public constructor(
    config: CodeMirror.EditorConfiguration,
    diff?: ITextDiff,
    oldContents?: Buffer,
    newContents?: Buffer
  ) {
    this.config = config
    this.diff = diff
    this.oldContents = oldContents
    this.newContents = newContents
  }

  public startState = (): IState => {
    const oldMode = CodeMirror.getMode(this.config, 'application/typescript')
    const oldModeState = oldMode.startState ? oldMode.startState() : undefined

    const newMode = CodeMirror.getMode(this.config, 'application/typescript')
    const newModeState = newMode.startState ? newMode.startState() : undefined

    return {
      diffLineIndex: 0,
      oldMode: {
        mode: oldMode,
        state: oldModeState,
        contents: this.oldContents,
        currentLine: 0,
      },
      newMode: {
        mode: newMode,
        state: newModeState,
        contents: this.newContents,
        currentLine: 0,
      },
    }
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

    const activeMode =
      diffLine.oldLineNumber !== null ? state.oldMode : state.newMode

    let diffLineNumber =
      diffLine.oldLineNumber !== null
        ? diffLine.oldLineNumber
        : diffLine.newLineNumber

    if (diffLineNumber === null) {
      stream.skipToEnd()
      state.diffLineIndex++
      return null
    }

    // Diffs use off-by-one indexing
    diffLineNumber--

    if (!activeMode.contents) {
      stream.skipToEnd()
      state.diffLineIndex++
      return null
    }

    const lines = activeMode.contents.toString('utf8').split(/\r?\n/)

    parseUntilLine(activeMode, this.config.tabSize, diffLineNumber, lines)

    if (activeMode.currentLine >= lines.length) {
      stream.skipToEnd()
      state.diffLineIndex++
      return null
    }

    const line = lines[activeMode.currentLine]

    if (!line.length) {
      debugger
      if (activeMode.mode.blankLine) {
        activeMode.mode.blankLine(activeMode.state)
      }
      stream.skipToEnd()
      state.diffLineIndex++
      return null
    }

    if (diffLine.content !== line) {
      stream.skipToEnd()
      state.diffLineIndex++
      return null
    }

    const lineStream =
      activeMode.currentLineStream ||
      (activeMode.currentLineStream = new (CodeMirror as any).StringStream(
        line,
        this.config.tabSize
      ) as CodeMirror.StringStream)

    const start = lineStream.pos
    const token = activeMode.mode.token(lineStream, activeMode.state)
    const length = lineStream.pos - start
    lineStream.start = lineStream.pos

    stream.pos += length

    if (stream.eol()) {
      state.diffLineIndex++
    }

    return token

    // stream.pos += length

    // console.log(activeMode.currentLine, diffLineNumber)

    // stream.skipToEnd()
    // state.diffLineIndex++
    // return null
  }
}

CodeMirror.defineMode(DiffSyntaxMode.ModeName, function(
  config: CodeMirror.EditorConfiguration,
  modeOptions?: IDiffSyntaxModeOptions
) {
  if (!modeOptions) {
    throw new Error('I needs me some options')
  }

  // if (
  //   !modeOptions.diff ||
  //   !modeOptions.oldContents ||
  //   !modeOptions.newContents
  // ) {
  //   return { token: parseToken }
  // }

  return new DiffSyntaxMode(
    config,
    modeOptions.diff,
    modeOptions.oldContents,
    modeOptions.newContents
  )
})
