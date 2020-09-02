import * as React from 'react'

import { getTokens } from './diff-syntax-mode'
import { syntaxHighlightLine, getDiffTokens } from './syntax-highlighting/utils'
import { ITokens } from '../../lib/highlighter/types'
import {
  WorkingDirectoryFileChange,
  CommittedFileChange,
} from '../../models/status'
import classNames from 'classnames'
import { ISelection, isInTemporarySelection } from './side-by-side-diff'

const MaxLineLengthToCalculateDiff = 240

export enum DiffRowType {
  Added = 'Added',
  Deleted = 'Deleted',
  Modified = 'Modified',
  Context = 'Context',
  Hunk = 'Hunk',
}

interface IDiffRowData {
  readonly content: string
  readonly lineNumber: number
  readonly diffLineNumber: number
  readonly isSelected: boolean
}

interface IDiffRowAdded {
  readonly type: DiffRowType.Added
  readonly data: IDiffRowData
}

interface IDiffRowDeleted {
  readonly type: DiffRowType.Deleted
  readonly data: IDiffRowData
}

interface IDiffRowModified {
  readonly type: DiffRowType.Modified
  readonly beforeData: IDiffRowData
  readonly afterData: IDiffRowData
  readonly displayDiffTokens: boolean
}

interface IDiffRowContext {
  readonly type: DiffRowType.Context
  readonly content: string
  readonly beforeLineNumber: number
  readonly afterLineNumber: number
}

interface IDiffRowHunk {
  readonly type: DiffRowType.Hunk
  readonly content: string
}

export type DiffRow =
  | IDiffRowAdded
  | IDiffRowDeleted
  | IDiffRowModified
  | IDiffRowContext
  | IDiffRowHunk

type ChangedFile = WorkingDirectoryFileChange | CommittedFileChange

interface ISideBySideDiffRowProps {
  readonly row: DiffRow
  readonly beforeTokens?: ITokens
  readonly afterTokens?: ITokens

  /** The file whose diff should be displayed. */
  readonly file: ChangedFile

  readonly hunkHighlightRange?: ISelection

  readonly onStartSelection?: (from: number, select: boolean) => void
  readonly onUpdateSelection?: (lineNumber: number) => void

  readonly onMouseEnterHunk?: (lineNumber: number) => void
  readonly onMouseLeaveHunk?: (lineNumber: number) => void
  readonly onClickHunk?: (lineNumber: number, select: boolean) => void
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
            <div className="gutter"></div>
            <div className="content">{row.content}</div>
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
        const afterTokens = getTokens(
          row.beforeLineNumber,
          this.props.beforeTokens
        )

        return (
          <div className="row context">
            <div className="before">
              <div className="gutter">{row.beforeLineNumber}</div>
              <div className="content">
                {syntaxHighlightLine(
                  row.content,
                  beforeTokens !== null ? [beforeTokens] : []
                )}
              </div>
            </div>
            <div className="after">
              <div className="gutter">{row.afterLineNumber}</div>
              <div className="content">
                {syntaxHighlightLine(
                  row.content,
                  afterTokens !== null ? [afterTokens] : []
                )}
              </div>
            </div>
          </div>
        )

      case DiffRowType.Added: {
        const tokens = getTokens(row.data.lineNumber, this.props.afterTokens)

        return (
          <div
            className={classNames([
              'row',
              'added',
              {
                'highlighted-hunk': isInTemporarySelection(
                  this.props.hunkHighlightRange,
                  row.data.diffLineNumber
                ),
              },
            ])}
            onMouseEnter={this.onMouseEnterGutter}
          >
            <div className="before">
              <div className="gutter"></div>
              <div className="content"></div>
            </div>
            {canSelect(this.props.file) && (
              <div
                className="hunk-handle"
                onMouseEnter={this.onMouseEnterHunk}
                onMouseLeave={this.onMouseLeaveHunk}
                onClick={this.onClickHunk}
              ></div>
            )}
            <div className="after">
              {this.renderGutter(row.data.lineNumber, row.data.isSelected)}
              <div className="content">
                {syntaxHighlightLine(
                  row.data.content,
                  tokens !== null ? [tokens] : []
                )}
              </div>
            </div>
          </div>
        )
      }
      case DiffRowType.Deleted: {
        const tokens = getTokens(row.data.lineNumber, this.props.beforeTokens)

        return (
          <div
            className={classNames([
              'row',
              'deleted',
              {
                'highlighted-hunk': isInTemporarySelection(
                  this.props.hunkHighlightRange,
                  row.data.diffLineNumber
                ),
              },
            ])}
            onMouseEnter={this.onMouseEnterGutter}
          >
            <div className="before">
              {this.renderGutter(row.data.lineNumber, row.data.isSelected)}
              <div className="content">
                {syntaxHighlightLine(
                  row.data.content,
                  tokens !== null ? [tokens] : []
                )}
              </div>
            </div>
            {canSelect(this.props.file) && (
              <div
                className="hunk-handle"
                onMouseEnter={this.onMouseEnterHunk}
                onMouseLeave={this.onMouseLeaveHunk}
                onClick={this.onClickHunk}
              ></div>
            )}
            <div className="after">
              <div className="gutter"></div>
              <div className="content"></div>
            </div>
          </div>
        )
      }
      case DiffRowType.Modified: {
        const syntaxTokensBefore = getTokens(
          row.beforeData.lineNumber,
          this.props.beforeTokens
        )
        const syntaxTokensAfter = getTokens(
          row.afterData.lineNumber,
          this.props.afterTokens
        )
        const tokensBefore =
          syntaxTokensBefore !== null ? [syntaxTokensBefore] : []
        const tokensAfter =
          syntaxTokensAfter !== null ? [syntaxTokensAfter] : []

        if (
          row.displayDiffTokens &&
          row.beforeData.content.length < MaxLineLengthToCalculateDiff &&
          row.afterData.content.length < MaxLineLengthToCalculateDiff
        ) {
          const { before, after } = getDiffTokens(
            row.beforeData.content,
            row.afterData.content
          )
          tokensBefore.push(before)
          tokensAfter.push(after)
        }

        return (
          <div
            className={classNames([
              'row',
              'modified',
              {
                'highlighted-hunk': isInTemporarySelection(
                  this.props.hunkHighlightRange,
                  row.beforeData.diffLineNumber
                ),
              },
            ])}
          >
            <div className="before" onMouseEnter={this.onMouseEnterGutter}>
              {this.renderGutter(
                row.beforeData.lineNumber,
                row.beforeData.isSelected
              )}
              <div className="content">
                {syntaxHighlightLine(row.beforeData.content, tokensBefore)}
              </div>
            </div>
            {canSelect(this.props.file) && (
              <div
                className="hunk-handle"
                onMouseEnter={this.onMouseEnterHunk}
                onMouseLeave={this.onMouseLeaveHunk}
                onClick={this.onClickHunk}
              ></div>
            )}
            <div className="after" onMouseEnter={this.onMouseEnterGutter}>
              {this.renderGutter(
                row.afterData.lineNumber,
                row.afterData.isSelected
              )}
              <div className="content">
                {syntaxHighlightLine(row.afterData.content, tokensAfter)}
              </div>
            </div>
          </div>
        )
      }
    }
  }

  private renderGutter(lineNumber: number, isSelected: boolean) {
    if (!canSelect(this.props.file)) {
      return <div className="gutter">{lineNumber}</div>
    }

    return (
      <div
        className={`gutter selectable ${isSelected ? 'line-selected ' : ''}`}
        onMouseDown={this.onMouseDownGutter}
      >
        {lineNumber}
      </div>
    )
  }

  private onMouseDownGutter = (evt: React.MouseEvent) => {
    if (!canSelect(this.props.file)) {
      return
    }

    if (this.props.onStartSelection === undefined) {
      return
    }

    const diffLineNumber = this.getDiffLineNumber(evt)
    const isSelected = this.getIsSelected(evt)

    if (diffLineNumber === null || isSelected === null) {
      return
    }

    this.props.onStartSelection(diffLineNumber, !isSelected)
  }

  private onMouseEnterGutter = (evt: React.MouseEvent) => {
    if (!canSelect(this.props.file)) {
      return
    }

    if (this.props.onUpdateSelection === undefined) {
      return
    }

    const diffLineNumber = this.getDiffLineNumber(evt)

    if (diffLineNumber === null) {
      return
    }

    this.props.onUpdateSelection(diffLineNumber)
  }

  private getDiffLineNumber(evt: React.MouseEvent | MouseEvent) {
    if (
      this.props.row.type === DiffRowType.Added ||
      this.props.row.type === DiffRowType.Deleted
    ) {
      return this.props.row.data.diffLineNumber
    }

    if (this.props.row.type === DiffRowType.Modified) {
      const target = evt.target as HTMLElement

      if (target.closest('.before')) {
        return this.props.row.beforeData.diffLineNumber
      }

      return this.props.row.afterData.diffLineNumber
    }

    return null
  }

  private getIsSelected(evt: React.MouseEvent) {
    if (
      this.props.row.type === DiffRowType.Added ||
      this.props.row.type === DiffRowType.Deleted
    ) {
      return this.props.row.data.isSelected
    }

    if (this.props.row.type === DiffRowType.Modified) {
      const target = evt.target as HTMLElement

      if (target.closest('.before')) {
        return this.props.row.beforeData.isSelected
      }

      return this.props.row.afterData.isSelected
    }

    return null
  }

  private onMouseEnterHunk = (evt: React.MouseEvent) => {
    const lineNumber = this.getDiffLineNumber(evt)

    if (this.props.onMouseEnterHunk && lineNumber !== null) {
      this.props.onMouseEnterHunk(lineNumber)
    }
  }

  private onMouseLeaveHunk = (evt: React.MouseEvent) => {
    const lineNumber = this.getDiffLineNumber(evt)

    if (this.props.onMouseLeaveHunk && lineNumber !== null) {
      this.props.onMouseLeaveHunk(lineNumber)
    }
  }

  private onClickHunk = (evt: React.MouseEvent) => {
    const lineNumber = this.getDiffLineNumber(evt)
    const isSelected = this.getIsSelected(evt)

    if (this.props.onClickHunk && lineNumber !== null && isSelected !== null) {
      this.props.onClickHunk(lineNumber, !isSelected)
    }
  }
}

/** Utility function for checking whether a file supports selection */
function canSelect(file: ChangedFile): file is WorkingDirectoryFileChange {
  return file instanceof WorkingDirectoryFileChange
}
