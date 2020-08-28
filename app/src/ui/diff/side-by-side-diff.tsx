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
import { ITokens } from '../../lib/highlighter/types'
import { assertNever, assertNonNullable } from '../../lib/fatal-error'
import classNames from 'classnames'
import {
  List,
  AutoSizer,
  CellMeasurerCache,
  CellMeasurer,
  ListRowProps,
} from 'react-virtualized'
import {
  DiffRow,
  DiffRowType,
  SideBySideDiffRow,
} from './side-by-side-diff-row'
import memoize from 'memoize-one'

type ChangedFile = WorkingDirectoryFileChange | CommittedFileChange

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
  readonly beforeTokens?: ITokens
  readonly afterTokens?: ITokens
  readonly selectingRow?: 'before' | 'after'
  readonly selection?: ISelection
}

interface ISelection {
  readonly from: number
  readonly to: number
  readonly isSelected: boolean
}

const cache = new CellMeasurerCache({
  defaultHeight: 20,
  fixedWidth: true,
})

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
          <AutoSizer onResize={this.clearCache}>
            {({ height, width }) => (
              <List
                deferredMeasurementCache={cache}
                width={width}
                height={height}
                // Passing them to force re-renders when tokens change.
                beforeTokens={this.state.beforeTokens}
                afterTokens={this.state.afterTokens}
                temporarySelection={this.state.selection}
                file={this.props.file}
                rowCount={
                  getDiffRows(
                    this.props.diff.hunks,
                    this.props.file,
                    this.state.selection
                  ).length
                }
                rowHeight={this.getRowHeight}
                rowRenderer={this.renderRow}
              />
            )}
          </AutoSizer>
        </div>
      </div>
    )
  }

  private renderRow = ({ index, parent, style, key }: ListRowProps) => {
    const rows = getDiffRows(
      this.props.diff.hunks,
      this.props.file,
      this.state.selection
    )
    const row = rows[index]

    if (row === undefined) {
      return null
    }

    return (
      <CellMeasurer
        cache={cache}
        columnIndex={0}
        key={key}
        overscanRowCount={10}
        parent={parent}
        rowIndex={index}
      >
        <div key={key} style={style}>
          <SideBySideDiffRow
            row={row}
            beforeTokens={this.state.beforeTokens}
            afterTokens={this.state.afterTokens}
            file={this.props.file}
            onStartSelection={this.onStartSelection}
            onUpdateSelection={this.onUpdateSelection}
          />
        </div>
      </CellMeasurer>
    )
  }

  private getRowHeight = (row: { index: number }) => {
    return cache.rowHeight(row) ?? 20
  }

  private clearCache = () => {
    cache.clearAll()
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
      beforeTokens: tokens.oldTokens,
      afterTokens: tokens.newTokens,
    })
  }

  private onStartSelection = (lineNumber: number, isSelected: boolean) => {
    this.setState({
      selection: {
        from: lineNumber,
        to: lineNumber,
        isSelected,
      },
    })

    document.addEventListener('mouseup', this.onEndSelection, { once: true })
  }

  private onEndSelection = () => {
    if (!canSelect(this.props.file)) {
      return
    }

    if (this.state.selection === undefined) {
      return
    }

    if (this.props.onIncludeChanged === undefined) {
      return
    }

    const from = Math.min(this.state.selection.from, this.state.selection.to)
    const to = Math.max(this.state.selection.from, this.state.selection.to)

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

  private onUpdateSelection = (lineNumber: number) => {
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

const getDiffRows = memoize(function (
  hunks: ReadonlyArray<DiffHunk>,
  file: ChangedFile,
  temporarySelection?: ISelection
): DiffRow[] {
  const rows: DiffRow[] = []

  for (const hunk of hunks) {
    rows.push(...getDiffRowsFromHunk(hunk, file, temporarySelection))
  }

  return rows
})

function getDiffRowsFromHunk(
  hunk: DiffHunk,
  file: ChangedFile,
  temporarySelection?: ISelection
): DiffRow[] {
  const rows: DiffRow[] = []
  let modifiedLines: DiffLine[] = []
  let lineNumber = 0

  for (const [num, line] of hunk.lines.entries()) {
    lineNumber = hunk.unifiedDiffStart + num

    if (line.type === DiffLineType.Delete || line.type === DiffLineType.Add) {
      modifiedLines.push(line)
      continue
    }

    if (modifiedLines.length > 0) {
      rows.push(
        ...getModifiedRows(
          modifiedLines,
          lineNumber - modifiedLines.length,
          file,
          temporarySelection
        )
      )

      modifiedLines = []
    }

    if (line.type === DiffLineType.Hunk) {
      rows.push({
        type: DiffRowType.Hunk,
        content: line.content,
      })
      continue
    }

    if (line.type === DiffLineType.Context) {
      assertNonNullable(
        line.oldLineNumber,
        `Expecting oldLineNumber value for ${line}`
      )
      assertNonNullable(
        line.newLineNumber,
        `Expecting newLineNumber value for ${line}`
      )

      rows.push({
        type: DiffRowType.Context,
        content: line.content,
        beforeLineNumber: line.oldLineNumber,
        afterLineNumber: line.newLineNumber,
        diffLine: line,
      })
      continue
    }

    assertNever(line.type, `Invalid line type: ${line.type}`)
  }

  if (modifiedLines.length > 0) {
    rows.push(
      ...getModifiedRows(
        modifiedLines,
        lineNumber - modifiedLines.length + 1,
        file,
        temporarySelection
      )
    )
  }

  return rows
}

function getModifiedRows(
  addedDeletedLines: ReadonlyArray<DiffLine>,
  offsetLineInDiff: number,
  file: ChangedFile,
  temporarySelection?: ISelection
): ReadonlyArray<DiffRow> {
  const addedLines = addedDeletedLines.filter(
    line => line.type === DiffLineType.Add
  )
  const deletedLines = addedDeletedLines.filter(
    line => line.type === DiffLineType.Delete
  )
  const shouldDisplayDiffInChunk = addedLines.length === deletedLines.length
  const output: Array<DiffRow> = []

  for (
    let numLine = 0;
    numLine < addedLines.length || numLine < deletedLines.length;
    numLine++
  ) {
    if (numLine >= deletedLines.length) {
      // Added line
      const line = addedLines[numLine]
      assertNonNullable(
        line.newLineNumber,
        `Expecting newLineNumber value for ${line}`
      )

      output.push({
        type: DiffRowType.Added,
        content: line.content,
        lineNumber: line.newLineNumber,
        diffLine: line,
        diffLineNumber: offsetLineInDiff + numLine,
        isSelected: isInSelection(
          offsetLineInDiff + numLine,
          file,
          temporarySelection
        ),
      })
    } else if (numLine >= addedLines.length) {
      // Deleted line
      const line = deletedLines[numLine]
      assertNonNullable(
        line.oldLineNumber,
        `Expecting oldLineNumber value for ${line}`
      )

      output.push({
        type: DiffRowType.Deleted,
        content: line.content,
        lineNumber: line.oldLineNumber,
        diffLine: line,
        diffLineNumber: offsetLineInDiff + numLine,
        isSelected: isInSelection(
          offsetLineInDiff + numLine,
          file,
          temporarySelection
        ),
      })
    } else {
      // Modified line
      const lineBefore = deletedLines[numLine]
      const lineAfter = addedLines[numLine]

      assertNonNullable(
        lineBefore.oldLineNumber,
        `Expecting oldLineNumber value for ${lineBefore}`
      )
      assertNonNullable(
        lineAfter.newLineNumber,
        `Expecting oldLineNumber value for ${lineAfter}`
      )

      output.push({
        type: DiffRowType.Modified,
        before: {
          content: lineBefore.content,
          lineNumber: lineBefore.oldLineNumber,
          diffLine: lineBefore,
          diffLineNumber: offsetLineInDiff + numLine,
          isSelected: isInSelection(
            offsetLineInDiff + numLine,
            file,
            temporarySelection
          ),
        },
        after: {
          content: lineAfter.content,
          lineNumber: lineAfter.newLineNumber,
          diffLine: lineAfter,
          diffLineNumber: offsetLineInDiff + numLine + deletedLines.length,
          isSelected: isInSelection(
            offsetLineInDiff + numLine + deletedLines.length,
            file,
            temporarySelection
          ),
        },
        displayDiffTokens: shouldDisplayDiffInChunk,
      })
    }
  }

  return output
}

function isInSelection(
  diffLineNumber: number,
  file: ChangedFile,
  temporarySelection?: ISelection
) {
  if (!canSelect(file)) {
    return false
  }

  const isInStoredSelection = file.selection.isSelected(diffLineNumber)

  if (temporarySelection === undefined) {
    return isInStoredSelection
  }

  const isInTemporalSelection =
    diffLineNumber >=
      Math.min(temporarySelection.from, temporarySelection.to) &&
    diffLineNumber <= Math.max(temporarySelection.from, temporarySelection.to)

  if (temporarySelection.isSelected) {
    return isInStoredSelection || isInTemporalSelection
  } else {
    return isInStoredSelection && !isInTemporalSelection
  }
}
