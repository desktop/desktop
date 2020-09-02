import * as React from 'react'

import { getTokens } from './diff-syntax-mode'
import {
  canSelect,
  getDiffData,
  getDiffTokens,
  isInTemporarySelection,
  syntaxHighlightLine,
  ChangedFile,
  DiffRow,
  DiffRowType,
  ISelection,
} from './diff-helpers'
import { ITokens, ILineTokens } from '../../lib/highlighter/types'
import classNames from 'classnames'

const MaxLineLengthToCalculateDiff = 240

interface ISideBySideDiffRowProps {
  readonly row: DiffRow
  readonly beforeTokens?: ITokens
  readonly afterTokens?: ITokens

  /** The file whose diff should be displayed. */
  readonly file: ChangedFile

  readonly hunkHighlightRange?: ISelection

  readonly onStartSelection: (from: number, select: boolean) => void
  readonly onUpdateSelection: (lineNumber: number) => void

  readonly onMouseEnterHunk: (lineNumber: number) => void
  readonly onMouseLeaveHunk: (lineNumber: number) => void
  readonly onClickHunk: (lineNumber: number, select: boolean) => void
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
            {this.renderContent(row.content)}
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
              {this.renderContent(row.content, beforeTokens)}
            </div>
            <div className="after">
              {this.renderGutter(row.afterLineNumber)}
              {this.renderContent(row.content, afterTokens)}
            </div>
          </div>
        )

      case DiffRowType.Added: {
        const tokens = getTokens(row.data.lineNumber, this.props.afterTokens)

        return (
          <div
            className={this.getRowClassNames('added')}
            onMouseEnter={this.onMouseEnterGutter}
          >
            <div className="before">
              {this.renderGutter()}
              {this.renderContent('')}
            </div>
            {this.renderHunkHandle()}
            <div className="after">
              {this.renderGutter(row.data.lineNumber, row.data.isSelected)}
              {this.renderContent(row.data.content, tokens)}
            </div>
          </div>
        )
      }
      case DiffRowType.Deleted: {
        const tokens = getTokens(row.data.lineNumber, this.props.beforeTokens)

        return (
          <div
            className={this.getRowClassNames('deleted')}
            onMouseEnter={this.onMouseEnterGutter}
          >
            <div className="before">
              {this.renderGutter(row.data.lineNumber, row.data.isSelected)}
              {this.renderContent(row.data.content, tokens)}
            </div>
            {this.renderHunkHandle()}
            <div className="after">
              {this.renderGutter()}
              {this.renderContent('')}
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
          <div className={this.getRowClassNames('modified')}>
            <div className="before" onMouseEnter={this.onMouseEnterGutter}>
              {this.renderGutter(
                row.beforeData.lineNumber,
                row.beforeData.isSelected
              )}
              {this.renderContent(
                row.beforeData.content,
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
                row.afterData.content,
                getTokens(row.afterData.lineNumber, this.props.afterTokens),
                diffTokensAfter
              )}
            </div>
          </div>
        )
      }
    }
  }

  private renderContent(
    lineContent: string,
    ...tokensArray: ReadonlyArray<ILineTokens | null>
  ) {
    return (
      <div className="content">
        {syntaxHighlightLine(lineContent, ...tokensArray)}
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
          'selectable',
          {
            'line-selected': isSelected === true,
          },
        ])}
        onMouseDown={this.onMouseDownGutter}
      >
        {lineNumber}
      </div>
    )
  }

  private getRowClassNames(className: string) {
    const data = getDiffData(this.props.row)

    return classNames([
      'row',
      className,
      {
        'highlighted-hunk':
          data !== null &&
          isInTemporarySelection(
            this.props.hunkHighlightRange,
            data.diffLineNumber
          ),
      },
    ])
  }

  private onMouseDownGutter = (evt: React.MouseEvent) => {
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
    const data = getDiffData(this.props.row)
    if (data === null) {
      return
    }

    this.props.onMouseEnterHunk(data.diffLineNumber)
  }

  private onMouseLeaveHunk = () => {
    const data = getDiffData(this.props.row)
    if (data === null) {
      return
    }

    this.props.onMouseLeaveHunk(data.diffLineNumber)
  }

  private onClickHunk = () => {
    const data = getDiffData(this.props.row)
    if (data === null) {
      return
    }

    this.props.onClickHunk(data.diffLineNumber, !data.isSelected)
  }
}
