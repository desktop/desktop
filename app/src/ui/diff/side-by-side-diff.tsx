/* eslint-disable react/jsx-no-bind */
import * as React from 'react'
import { Repository } from '../../models/repository'
import {
  ITextDiff,
  DiffLineType,
  DiffHunk,
  DiffLine,
  DiffSelection,
} from '../../models/diff'
import {
  WorkingDirectoryFileChange,
  CommittedFileChange,
} from '../../models/status'
import {
  getLineFilters,
  getFileContents,
  highlightContents,
} from './syntax-highlighting'
import { getTokensForDiffLine } from './diff-syntax-mode'
import { ITokens } from '../../lib/highlighter/types'
import { assertNever } from '../../lib/fatal-error'
import { getDiffTokens, syntaxHighlightLine } from './syntax-highlighting/utils'
import classNames from 'classnames'

type ChangedFile = WorkingDirectoryFileChange | CommittedFileChange

const MaxLineLengthToCalculateDiff = 240

interface ISideBySideDiffProps {
  readonly repository: Repository
  /** The file whose diff should be displayed. */
  readonly file: ChangedFile
  /** The diff that should be rendered */
  readonly diff: ITextDiff

  /**
   * Called when the includedness of lines or a range of lines has changed.
   * Only applicable when readOnly is false.
   */
  readonly onIncludeChanged?: (diffSelection: DiffSelection) => void
}

interface ISideBySideDiffState {
  readonly oldTokens?: ITokens
  readonly newTokens?: ITokens
  readonly selectingRow?: 'before' | 'after'
  readonly selection?: ISelection
}

interface ISelection {
  readonly from: number
  readonly to: number
  readonly isSelected: boolean
}

export class SideBySideDiff extends React.Component<
  ISideBySideDiffProps,
  ISideBySideDiffState
> {
  public constructor(props: ISideBySideDiffProps) {
    super(props)

    this.state = {}
  }

  public componentDidMount() {
    this.initDiffSyntaxMode()
  }

  public componentDidUpdate(prevProps: ISideBySideDiffProps) {
    if (!highlightParametersEqual(this.props, prevProps)) {
      this.initDiffSyntaxMode()
    }
  }

  public render() {
    return (
      <div
        className={classNames([
          {
            'side-by-side-diff-container': true,
            [`selecting-${this.state.selectingRow}`]:
              this.state.selectingRow !== undefined,
            editable: canSelect(this.props.file),
          },
        ])}
        onMouseDown={this.onMouseDown}
      >
        <div className="side-by-side-diff cm-s-default">
          {this.props.diff.hunks.map(hunk => this.renderHunk(hunk))}
        </div>
      </div>
    )
  }

  private onMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLDivElement

    const clickedRow = target.closest('.before') || target.closest('.after')

    if (clickedRow === null) {
      return
    }

    if (clickedRow.classList.contains('before')) {
      this.setState({ selectingRow: 'before' })
    } else if (clickedRow.classList.contains('after')) {
      this.setState({ selectingRow: 'after' })
    }
  }

  private renderHunk(hunk: DiffHunk) {
    const rows: Array<JSX.Element> = []
    let addedDeletedLines: Array<DiffLine> = []

    let lineNumber = 0

    for (const [num, line] of hunk.lines.entries()) {
      lineNumber = hunk.unifiedDiffStart + num

      if (line.type === DiffLineType.Delete || line.type === DiffLineType.Add) {
        addedDeletedLines.push(line)
        continue
      }

      if (addedDeletedLines.length > 0) {
        rows.push(
          ...this.renderAddedDeletedLines(
            addedDeletedLines,
            lineNumber - addedDeletedLines.length
          )
        )

        addedDeletedLines = []
      }

      if (line.type === DiffLineType.Hunk) {
        rows.push(
          <div className="row hunk-info" key={lineNumber}>
            <div className="gutter"></div>
            <div className="content">{line.content}</div>
          </div>
        )
        continue
      }

      if (line.type === DiffLineType.Context) {
        const tokens = getTokensForDiffLine(
          line,
          this.state.oldTokens,
          this.state.newTokens
        )

        const highlightedContent = syntaxHighlightLine(
          line.content,
          tokens !== null ? [tokens] : []
        )

        rows.push(
          <div className="row context" key={lineNumber}>
            <div className="before">
              <div className="gutter">{line.oldLineNumber}</div>
              <div className="content">{highlightedContent}</div>
            </div>
            <div className="after">
              <div className="gutter">{line.newLineNumber}</div>
              <div className="content">{highlightedContent}</div>
            </div>
          </div>
        )
        continue
      }

      assertNever(line.type, `Invalid line type: ${line.type}`)
    }

    if (addedDeletedLines.length > 0) {
      rows.push(
        ...this.renderAddedDeletedLines(
          addedDeletedLines,
          lineNumber - addedDeletedLines.length + 1
        )
      )
    }

    return rows
  }

  private renderAddedDeletedLines(
    addedDeletedLines: ReadonlyArray<DiffLine>,
    offsetLine: number
  ): ReadonlyArray<JSX.Element> {
    const addedLines = addedDeletedLines.filter(
      line => line.type === DiffLineType.Add
    )
    const deletedLines = addedDeletedLines.filter(
      line => line.type === DiffLineType.Delete
    )
    const shouldDisplayDiffInChunk = addedLines.length === deletedLines.length
    const output: Array<JSX.Element> = []

    for (
      let numLine = 0;
      numLine < addedLines.length || numLine < deletedLines.length;
      numLine++
    ) {
      if (numLine >= deletedLines.length) {
        // Added line
        const line = addedLines[numLine]
        const tokens = getTokensForDiffLine(
          line,
          this.state.oldTokens,
          this.state.newTokens
        )

        output.push(
          <div className="row added" key={offsetLine + numLine}>
            <div className="before">
              <div className="gutter"></div>
              <div className="content"></div>
            </div>
            <div className="after">
              {this.renderGutter(
                offsetLine + numLine + deletedLines.length,
                line.newLineNumber
              )}
              <div className="content">
                {syntaxHighlightLine(
                  line.content,
                  tokens !== null ? [tokens] : []
                )}
              </div>
            </div>
          </div>
        )
      } else if (numLine >= addedLines.length) {
        // Deleted line
        const line = deletedLines[numLine]
        const tokens = getTokensForDiffLine(
          line,
          this.state.oldTokens,
          this.state.newTokens
        )

        output.push(
          <div className="row deleted" key={offsetLine + numLine}>
            <div className="before">
              {this.renderGutter(offsetLine + numLine, line.oldLineNumber)}
              <div className="content">
                {syntaxHighlightLine(
                  line.content,
                  tokens !== null ? [tokens] : []
                )}
              </div>
            </div>

            <div className="after">
              <div className="gutter"></div>
              <div className="content"></div>
            </div>
          </div>
        )
      } else {
        // Modified line
        const lineBefore = deletedLines[numLine]
        const syntaxTokensBefore = getTokensForDiffLine(
          lineBefore,
          this.state.oldTokens,
          this.state.newTokens
        )
        const lineAfter = addedLines[numLine]
        const syntaxTokensAfter = getTokensForDiffLine(
          lineAfter,
          this.state.oldTokens,
          this.state.newTokens
        )
        const tokensBefore =
          syntaxTokensBefore !== null ? [syntaxTokensBefore] : []
        const tokensAfter =
          syntaxTokensAfter !== null ? [syntaxTokensAfter] : []

        if (
          shouldDisplayDiffInChunk &&
          lineBefore.content.length < MaxLineLengthToCalculateDiff &&
          lineAfter.content.length < MaxLineLengthToCalculateDiff
        ) {
          const { before, after } = getDiffTokens(
            lineBefore.content,
            lineAfter.content
          )
          tokensBefore.push(before)
          tokensAfter.push(after)
        }

        output.push(
          <div className="row modified" key={offsetLine + numLine}>
            <div className="before">
              {this.renderGutter(
                offsetLine + numLine,
                lineBefore.oldLineNumber
              )}
              <div className="content">
                {syntaxHighlightLine(lineBefore.content, tokensBefore)}
              </div>
            </div>

            <div className="after">
              {this.renderGutter(
                offsetLine + numLine + deletedLines.length,
                lineAfter.newLineNumber
              )}
              <div className="content">
                {syntaxHighlightLine(lineAfter.content, tokensAfter)}
              </div>
            </div>
          </div>
        )
      }
    }

    return output
  }

  private async initDiffSyntaxMode() {
    const { file, diff, repository } = this.props

    // Store the current props to that we can see if anything
    // changes from underneath us as we're making asynchronous
    // operations that makes our data stale or useless.
    const propsSnapshot = this.props

    const lineFilters = getLineFilters(diff.hunks)
    const tabSize = 4

    const contents = await getFileContents(repository, file, lineFilters)

    if (!highlightParametersEqual(this.props, propsSnapshot)) {
      return
    }

    const tokens = await highlightContents(contents, tabSize, lineFilters)

    if (!highlightParametersEqual(this.props, propsSnapshot)) {
      return
    }

    this.setState({
      oldTokens: tokens.oldTokens,
      newTokens: tokens.newTokens,
    })
  }

  private renderGutter(diffLineNumber: number, lineNumber?: number | null) {
    if (!canSelect(this.props.file)) {
      return <div className="gutter">{lineNumber}</div>
    }

    const isSelected = this.isInSelection(diffLineNumber)

    return (
      <div
        className={`${diffLineNumber} gutter selectable ${
          isSelected ? 'line-selected ' : ''
        }`}
        // tslint:disable-next-line: react-this-binding-issue
        onMouseDown={evt => this.onMouseDownGutter(evt, diffLineNumber)}
        // tslint:disable-next-line: react-this-binding-issue
        onMouseUp={evt => this.onMouseUpGutter(evt, diffLineNumber)}
        // tslint:disable-next-line: react-this-binding-issue
        onMouseEnter={evt => this.onMouseEnterGutter(evt, diffLineNumber)}
      >
        {lineNumber}
      </div>
    )
  }

  private isInSelection(lineNumber: number) {
    if (!canSelect(this.props.file)) {
      return false
    }

    const isInStoredSelection = this.props.file.selection.isSelected(lineNumber)

    if (this.state.selection === undefined) {
      return isInStoredSelection
    }

    const isInTemporalSelection =
      lineNumber >=
        Math.min(this.state.selection.from, this.state.selection.to) &&
      lineNumber <= Math.max(this.state.selection.from, this.state.selection.to)

    if (this.state.selection.isSelected) {
      return isInStoredSelection || isInTemporalSelection
    } else {
      return isInStoredSelection && !isInTemporalSelection
    }
  }

  private onMouseDownGutter = (evt: React.MouseEvent, lineNumber: number) => {
    if (!canSelect(this.props.file)) {
      return
    }

    const isSelected = this.props.file.selection.isSelected(lineNumber)

    this.setState({
      selection: {
        from: lineNumber,
        to: lineNumber,
        isSelected: !isSelected,
      },
    })
  }

  private onMouseUpGutter = (evt: React.MouseEvent, lineNumber: number) => {
    if (!canSelect(this.props.file)) {
      return
    }

    if (this.state.selection === undefined) {
      return
    }

    if (this.props.onIncludeChanged === undefined) {
      return
    }

    const from = Math.min(this.state.selection.from, lineNumber)
    const to = Math.max(this.state.selection.from, lineNumber)

    this.props.onIncludeChanged(
      this.props.file.selection.withRangeSelection(
        from,
        to - from + 1,
        this.state.selection.isSelected
      )
    )

    this.setState({
      selection: undefined,
    })
  }

  private onMouseEnterGutter = (evt: React.MouseEvent, lineNumber: number) => {
    if (!canSelect(this.props.file)) {
      return
    }

    if (this.state.selection === undefined) {
      return
    }

    this.setState({
      selection: {
        ...this.state.selection,
        to: lineNumber,
      },
    })
  }
}

/**
 * Checks to see if any key parameters in the props object that are used
 * when performing highlighting has changed. This is used to determine
 * whether highlighting should abort in between asynchronous operations
 * due to some factor (like which file is currently selected) have changed
 * and thus rendering the in-flight highlighting data useless.
 */
function highlightParametersEqual(
  newProps: ISideBySideDiffProps,
  prevProps: ISideBySideDiffProps
) {
  return (
    newProps === prevProps ||
    (newProps.file.id === prevProps.file.id &&
      newProps.diff.text === prevProps.diff.text)
  )
}

/** Utility function for checking whether a file supports selection */
function canSelect(file: ChangedFile): file is WorkingDirectoryFileChange {
  return file instanceof WorkingDirectoryFileChange
}
