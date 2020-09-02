import * as React from 'react'
import { getTokensForDiffLine } from './diff-syntax-mode'
import { syntaxHighlightLine, getDiffTokens } from './syntax-highlighting/utils'
import { ITokens } from '../../lib/highlighter/types'
import { DiffLine } from '../../models/diff'
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

interface IDiffRowAdded {
  readonly type: DiffRowType.Added
  readonly content: string
  readonly lineNumber: number
  readonly diffLine: DiffLine
  readonly diffLineNumber: number
  readonly isSelected: boolean
}

interface IDiffRowDeleted {
  readonly type: DiffRowType.Deleted
  readonly content: string
  readonly lineNumber: number
  readonly diffLine: DiffLine
  readonly diffLineNumber: number
  readonly isSelected: boolean
}

interface IDiffRowModified {
  readonly type: DiffRowType.Modified
  readonly before: {
    readonly content: string
    readonly lineNumber: number
    readonly diffLine: DiffLine
    readonly diffLineNumber: number
    readonly isSelected: boolean
  }
  readonly after: {
    readonly content: string
    readonly lineNumber: number
    readonly diffLine: DiffLine
    readonly diffLineNumber: number
    readonly isSelected: boolean
  }
  readonly displayDiffTokens: boolean
}

interface IDiffRowContext {
  readonly type: DiffRowType.Context
  readonly content: string
  readonly beforeLineNumber: number
  readonly afterLineNumber: number
  readonly diffLine: DiffLine
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
        const tokens = getTokensForDiffLine(
          row.diffLine,
          this.props.beforeTokens,
          this.props.afterTokens
        )

        return (
          <div className="row context">
            <div className="before">
              <div className="gutter">{row.beforeLineNumber}</div>
              <div className="content">
                {syntaxHighlightLine(
                  row.content,
                  tokens !== null ? [tokens] : []
                )}
              </div>
            </div>
            <div className="after">
              <div className="gutter">{row.afterLineNumber}</div>
              <div className="content">
                {syntaxHighlightLine(
                  row.content,
                  tokens !== null ? [tokens] : []
                )}
              </div>
            </div>
          </div>
        )

      case DiffRowType.Added: {
        const tokens = getTokensForDiffLine(
          row.diffLine,
          this.props.beforeTokens,
          this.props.afterTokens
        )

        console.log(
          'rafeca: hunkhilghtign',
          isInTemporarySelection(
            this.props.hunkHighlightRange,
            row.diffLineNumber
          )
        )

        return (
          <div
            className={classNames([
              'row',
              'added',
              {
                'highlighted-hunk': isInTemporarySelection(
                  this.props.hunkHighlightRange,
                  row.diffLineNumber
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
              {this.renderGutter(row.lineNumber, row.isSelected)}
              <div className="content">
                {syntaxHighlightLine(
                  row.content,
                  tokens !== null ? [tokens] : []
                )}
              </div>
            </div>
          </div>
        )
      }
      case DiffRowType.Deleted: {
        const tokens = getTokensForDiffLine(
          row.diffLine,
          this.props.beforeTokens,
          this.props.afterTokens
        )

        return (
          <div
            className={classNames([
              'row',
              'deleted',
              {
                'highlighted-hunk': isInTemporarySelection(
                  this.props.hunkHighlightRange,
                  row.diffLineNumber
                ),
              },
            ])}
            onMouseEnter={this.onMouseEnterGutter}
          >
            <div className="before">
              {this.renderGutter(row.lineNumber, row.isSelected)}
              <div className="content">
                {syntaxHighlightLine(
                  row.content,
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
        const syntaxTokensBefore = getTokensForDiffLine(
          row.before.diffLine,
          this.props.beforeTokens,
          this.props.afterTokens
        )
        const syntaxTokensAfter = getTokensForDiffLine(
          row.after.diffLine,
          this.props.beforeTokens,
          this.props.afterTokens
        )
        const tokensBefore =
          syntaxTokensBefore !== null ? [syntaxTokensBefore] : []
        const tokensAfter =
          syntaxTokensAfter !== null ? [syntaxTokensAfter] : []

        if (
          row.displayDiffTokens &&
          row.before.content.length < MaxLineLengthToCalculateDiff &&
          row.after.content.length < MaxLineLengthToCalculateDiff
        ) {
          const { before, after } = getDiffTokens(
            row.before.content,
            row.after.content
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
                  row.before.diffLineNumber
                ),
              },
            ])}
          >
            <div className="before" onMouseEnter={this.onMouseEnterGutter}>
              {this.renderGutter(row.before.lineNumber, row.before.isSelected)}
              <div className="content">
                {syntaxHighlightLine(row.before.content, tokensBefore)}
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
              {this.renderGutter(row.after.lineNumber, row.after.isSelected)}
              <div className="content">
                {syntaxHighlightLine(row.after.content, tokensAfter)}
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
      return this.props.row.diffLineNumber
    }

    if (this.props.row.type === DiffRowType.Modified) {
      const target = evt.target as HTMLElement

      if (target.closest('.before')) {
        return this.props.row.before.diffLineNumber
      }

      return this.props.row.after.diffLineNumber
    }

    return null
  }

  private getIsSelected(evt: React.MouseEvent) {
    if (
      this.props.row.type === DiffRowType.Added ||
      this.props.row.type === DiffRowType.Deleted
    ) {
      return this.props.row.isSelected
    }

    if (this.props.row.type === DiffRowType.Modified) {
      const target = evt.target as HTMLElement

      if (target.closest('.before')) {
        return this.props.row.before.isSelected
      }

      return this.props.row.after.isSelected
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

    console.log('rafeca: sidebyside', lineNumber, isSelected)

    if (this.props.onClickHunk && lineNumber !== null && isSelected !== null) {
      this.props.onClickHunk(lineNumber, !isSelected)
    }
  }
}

/** Utility function for checking whether a file supports selection */
function canSelect(file: ChangedFile): file is WorkingDirectoryFileChange {
  return file instanceof WorkingDirectoryFileChange
}
