import * as React from 'react'

import { getTokens } from './diff-syntax-mode'
import { syntaxHighlightLine, getDiffTokens } from './syntax-highlighting/utils'
import { ITokens, ILineTokens } from '../../lib/highlighter/types'
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

export interface IDiffRowData {
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
    const diffLineNumber = this.getDiffLineNumber()

    return classNames([
      'row',
      className,
      {
        'highlighted-hunk':
          diffLineNumber !== null &&
          isInTemporarySelection(this.props.hunkHighlightRange, diffLineNumber),
      },
    ])
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

  private getDiffLineNumber(evt?: React.MouseEvent) {
    if (
      this.props.row.type === DiffRowType.Added ||
      this.props.row.type === DiffRowType.Deleted
    ) {
      return this.props.row.data.diffLineNumber
    }

    if (this.props.row.type !== DiffRowType.Modified) {
      return null
    }

    const target = evt?.target as HTMLElement | undefined

    if (target === undefined || target.closest('.before')) {
      return this.props.row.beforeData.diffLineNumber
    }

    return this.props.row.afterData.diffLineNumber
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
