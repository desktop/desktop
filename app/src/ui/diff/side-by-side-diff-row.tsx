import * as React from 'react'

import { getTokens } from './diff-syntax-mode'
import {
  canSelect,
  getDiffData,
  getDiffTokens,
  syntaxHighlightLine,
  ChangedFile,
  DiffRow,
  DiffRowType,
  IDiffRowData,
} from './diff-helpers'
import { ITokens, ILineTokens } from '../../lib/highlighter/types'
import classNames from 'classnames'
import { Octicon } from '../octicons'
import { narrowNoNewlineSymbol } from './text-diff'
import { shallowEquals, structuralEquals } from '../../lib/equality'

const MaxLineLengthToCalculateDiff = 240

interface ISideBySideDiffRowProps {
  readonly row: DiffRow
  readonly beforeTokens?: ITokens
  readonly afterTokens?: ITokens

  /** The file whose diff should be displayed. */
  readonly file: ChangedFile

  readonly isHunkHovered: boolean

  readonly onStartSelection: (from: number, select: boolean) => void
  readonly onUpdateSelection: (lineNumber: number) => void

  readonly onMouseEnterHunk: (lineNumber: number) => void
  readonly onMouseLeaveHunk: (lineNumber: number) => void
  readonly onContextMenuLine: (lineNumber: number) => void
  readonly onClickHunk: (hunkStartLine: number, select: boolean) => void
  readonly onContextMenuHunk: (hunkStartLine: number) => void
}

export class SideBySideDiffRow extends React.Component<
  ISideBySideDiffRowProps
> {
  public render() {
    const row = this.props.row

    switch (row.type) {
      case DiffRowType.Hunk:
        return (
          <div className="row hunk-info">
            {this.renderGutter()}
            {this.renderContentFromString(row.content)}
          </div>
        )
      case DiffRowType.Context:
        const beforeTokens = getTokens(
          row.beforeLineNumber,
          this.props.beforeTokens
        )
        // TODO: It would be more resiliant to use here afterLineNumber
        // and afterTokens, since the syntax highlighting depends on
        // previous lines. That's currently not possible because an
        // optimization done in getLineFilters() that avoids calculating
        // the syntax highlighting of the after state of context lines.
        const afterTokens = beforeTokens

        return (
          <div className="row context">
            <div className="before">
              {this.renderGutter(row.beforeLineNumber)}
              {this.renderContentFromString(row.content, beforeTokens)}
            </div>
            <div className="after">
              {this.renderGutter(row.afterLineNumber)}
              {this.renderContentFromString(row.content, afterTokens)}
            </div>
          </div>
        )

      case DiffRowType.Added: {
        const tokens = getTokens(row.data.lineNumber, this.props.afterTokens)

        return (
          <div className="row added" onMouseEnter={this.onMouseEnterGutter}>
            <div className="before">
              {this.renderGutter()}
              {this.renderContentFromString('')}
            </div>
            {this.renderHunkHandle()}
            <div className="after">
              {this.renderGutter(row.data.lineNumber, row.data.isSelected)}
              {this.renderContent(row.data, tokens)}
            </div>
          </div>
        )
      }
      case DiffRowType.Deleted: {
        const tokens = getTokens(row.data.lineNumber, this.props.beforeTokens)

        return (
          <div className="row deleted" onMouseEnter={this.onMouseEnterGutter}>
            <div className="before">
              {this.renderGutter(row.data.lineNumber, row.data.isSelected)}
              {this.renderContent(row.data, tokens)}
            </div>
            {this.renderHunkHandle()}
            <div className="after">
              {this.renderGutter()}
              {this.renderContentFromString('')}
            </div>
          </div>
        )
      }
      case DiffRowType.Modified: {
        let diffTokensBefore: ILineTokens | null = null
        let diffTokensAfter: ILineTokens | null = null

        if (
          row.displayDiffTokens &&
          row.beforeData.content.length < MaxLineLengthToCalculateDiff &&
          row.afterData.content.length < MaxLineLengthToCalculateDiff
        ) {
          const { before, after } = getDiffTokens(
            row.beforeData.content,
            row.afterData.content
          )
          diffTokensBefore = before
          diffTokensAfter = after
        }

        return (
          <div className="row modified">
            <div className="before" onMouseEnter={this.onMouseEnterGutter}>
              {this.renderGutter(
                row.beforeData.lineNumber,
                row.beforeData.isSelected
              )}
              {this.renderContent(
                row.beforeData,
                getTokens(row.beforeData.lineNumber, this.props.beforeTokens),
                diffTokensBefore
              )}
            </div>
            {this.renderHunkHandle()}
            <div className="after" onMouseEnter={this.onMouseEnterGutter}>
              {this.renderGutter(
                row.afterData.lineNumber,
                row.afterData.isSelected
              )}
              {this.renderContent(
                row.afterData,
                getTokens(row.afterData.lineNumber, this.props.afterTokens),
                diffTokensAfter
              )}
            </div>
          </div>
        )
      }
    }
  }

  public shouldComponentUpdate(nextProps: ISideBySideDiffRowProps) {
    const { file: prevFile, row: prevRow, ...restPrevProps } = this.props
    const { file: nextFile, row: nextRow, ...restNextProps } = nextProps

    if (prevFile.id !== nextFile.id) {
      return true
    }

    if (!structuralEquals(prevRow, nextRow)) {
      return true
    }

    return !shallowEquals(restPrevProps, restNextProps)
  }

  private renderContentFromString(
    line: string,
    ...tokensArray: ReadonlyArray<ILineTokens | null>
  ) {
    return this.renderContent(
      { content: line, noNewLineIndicator: false },
      ...tokensArray
    )
  }

  private renderContent(
    data: Pick<IDiffRowData, 'content' | 'noNewLineIndicator'>,
    ...tokensArray: ReadonlyArray<ILineTokens | null>
  ) {
    return (
      <div className="content">
        {syntaxHighlightLine(data.content, ...tokensArray)}
        {data.noNewLineIndicator && (
          <Octicon
            symbol={narrowNoNewlineSymbol}
            title="No newline at end of file"
          />
        )}
      </div>
    )
  }

  private renderHunkHandle() {
    if (!canSelect(this.props.file)) {
      return null
    }

    return (
      <div
        className="hunk-handle"
        onMouseEnter={this.onMouseEnterHunk}
        onMouseLeave={this.onMouseLeaveHunk}
        onClick={this.onClickHunk}
        onContextMenu={this.onContextMenuHunk}
      ></div>
    )
  }

  private renderGutter(lineNumber?: number, isSelected?: boolean) {
    if (!canSelect(this.props.file)) {
      return <div className="gutter">{lineNumber}</div>
    }

    return (
      <div
        className={classNames([
          'gutter',
          {
            selectable: isSelected !== undefined,
            'line-selected': isSelected === true,
            hover: this.props.isHunkHovered,
          },
        ])}
        onMouseDown={this.onMouseDownGutter}
        onContextMenu={this.onContextMenuGutter}
      >
        {lineNumber}
      </div>
    )
  }

  private onMouseDownGutter = (evt: React.MouseEvent) => {
    if (evt.buttons === 2) {
      return
    }

    const data = getDiffData(this.props.row, evt.currentTarget)
    if (data === null) {
      return
    }

    this.props.onStartSelection(data.diffLineNumber, !data.isSelected)
  }

  private onMouseEnterGutter = (evt: React.MouseEvent) => {
    const data = getDiffData(this.props.row, evt.currentTarget)
    if (data === null) {
      return
    }

    this.props.onUpdateSelection(data.diffLineNumber)
  }

  private onMouseEnterHunk = () => {
    if (this.props.row.hunkStartLine !== undefined) {
      this.props.onMouseEnterHunk(this.props.row.hunkStartLine)
    }
  }

  private onMouseLeaveHunk = () => {
    if (this.props.row.hunkStartLine !== undefined) {
      this.props.onMouseLeaveHunk(this.props.row.hunkStartLine)
    }
  }

  private onClickHunk = () => {
    const data = getDiffData(this.props.row)
    if (data === null) {
      return
    }

    if (this.props.row.hunkStartLine !== undefined) {
      this.props.onClickHunk(this.props.row.hunkStartLine, !data.isSelected)
    }
  }

  private onContextMenuGutter = (evt: React.MouseEvent) => {
    const data = getDiffData(this.props.row, evt.currentTarget)
    if (data === null) {
      return
    }

    this.props.onContextMenuLine(data.diffLineNumber)
  }

  private onContextMenuHunk = () => {
    if (this.props.row.hunkStartLine !== undefined) {
      this.props.onContextMenuHunk(this.props.row.hunkStartLine)
    }
  }
}
