// tslint:disable: react-unused-props-and-state

import * as React from 'react'
import { Repository } from '../../models/repository'
import { ITextDiff, DiffSelection, DiffLineType } from '../../models/diff'
import {
  WorkingDirectoryFileChange,
  CommittedFileChange,
} from '../../models/status'
import classNames from 'classnames'

type ChangedFile = WorkingDirectoryFileChange | CommittedFileChange

interface IUnifiedDiffProps {
  readonly repository: Repository
  /** The file whose diff should be displayed. */
  readonly file: ChangedFile
  /** The diff that should be rendered */
  readonly diff: ITextDiff
  /** If true, no selections or discards can be done against this diff. */
  readonly readOnly: boolean
  /**
   * Called when the includedness of lines or a range of lines has changed.
   * Only applicable when readOnly is false.
   */
  readonly onIncludeChanged?: (diffSelection: DiffSelection) => void
  /**
   * Called when the user wants to discard a selection of the diff.
   * Only applicable when readOnly is false.
   */
  readonly onDiscardChanges?: (
    diff: ITextDiff,
    diffSelection: DiffSelection
  ) => void
  /**
   * Whether we'll show a confirmation dialog when the user
   * discards changes.
   */
  readonly askForConfirmationOnDiscardChanges?: boolean
}

export class UnifiedDiff extends React.Component<IUnifiedDiffProps> {
  public render() {
    return (
      <div className="unified-diff-container">
        <div className={'unified-diff'}>{this.renderHunks()}</div>
      </div>
    )
  }

  private renderHunks() {
    let numPreviousDeleteLines = 0
    let numLinesToIgnoreBefore = 0

    return (
      <>
        {this.props.diff.hunks.map(hunk => {
          return hunk.lines.map(line => {
            switch (line.type) {
              case DiffLineType.Context:
                numPreviousDeleteLines = 0
                return (
                  <div className="row context">
                    <div className="before">
                      <div className="gutter">{line.oldLineNumber}</div>
                      <div className="content">{line.content}</div>
                    </div>
                    <div className="after">
                      <div className="gutter">{line.newLineNumber}</div>
                      <div className="content">{line.content}</div>
                    </div>
                  </div>
                )

              case DiffLineType.Hunk:
                numPreviousDeleteLines = 0
                return (
                  <div className="row hunk-info">
                    <div className="gutter"></div>
                    <div className="content">{line.content}</div>
                  </div>
                )

              case DiffLineType.Delete:
                numPreviousDeleteLines++
                return (
                  <div className="row deleted">
                    <div className="before">
                      <div className="gutter">{line.oldLineNumber}</div>
                      <div className="content">{line.text.slice(1)}</div>
                    </div>
                    <div className="after">
                      <div className="gutter">{line.newLineNumber}</div>
                      <div className="content"></div>
                    </div>
                  </div>
                )

              case DiffLineType.Add:
                const marginTop = numPreviousDeleteLines * 20
                if (numPreviousDeleteLines > 0) {
                  numLinesToIgnoreBefore = numPreviousDeleteLines
                } else {
                  numLinesToIgnoreBefore--
                }
                numPreviousDeleteLines = 0

                return (
                  <div
                    className="row added"
                    style={{
                      marginTop: `-${marginTop}px`,
                      minHeight: `${marginTop}px`,
                    }}
                  >
                    <div
                      className={classNames('before', {
                        hidden: numLinesToIgnoreBefore > 0,
                      })}
                    >
                      <div className="gutter">{line.oldLineNumber}</div>
                      <div className="content"></div>
                    </div>
                    <div className="after">
                      <div className="gutter">{line.newLineNumber}</div>
                      <div className="content">{line.text.slice(1)}</div>
                    </div>
                  </div>
                )
            }
          })
        })}
      </>
    )
  }
}
