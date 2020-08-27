// tslint:disable: react-unused-props-and-state

import * as React from 'react'
import { Repository } from '../../models/repository'
import { ITextDiff, DiffSelection, DiffLineType } from '../../models/diff'
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
import { ITokens, ILineTokens, IToken } from '../../lib/highlighter/types'
import { DiffMatchPatch, Diff } from 'diff-match-patch-typescript'

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

interface IUnifiedDiffState {
  readonly oldTokens?: ITokens
  readonly newTokens?: ITokens
}

export class UnifiedDiff extends React.Component<
  IUnifiedDiffProps,
  IUnifiedDiffState
> {
  public constructor(props: IUnifiedDiffProps) {
    super(props)

    this.state = {}
  }

  public render() {
    return (
      <div className="unified-diff-container">
        <div className="unified-diff cm-s-default">{this.renderHunks()}</div>
      </div>
    )
  }

  private renderHunks() {
    return (
      <>
        {this.props.diff.hunks.map(hunk => {
          const addedLines = hunk.lines.filter(
            line => line.type === DiffLineType.Add
          )
          let numDeletedLine = 0
          let numModifiedLines = 0

          return hunk.lines.map(line => {
            const tokens =
              getTokensForDiffLine(
                line,
                this.state.oldTokens,
                this.state.newTokens
              ) || []

            switch (line.type) {
              case DiffLineType.Context:
                const highlightedContent = syntaxHighlightLine(
                  lineToDiff(line.content),
                  tokens,
                  true
                )

                return (
                  <div className="row context">
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

              case DiffLineType.Hunk:
                return (
                  <div className="row hunk-info">
                    <div className="gutter"></div>
                    <div className="content">{line.content}</div>
                  </div>
                )

              case DiffLineType.Delete:
                if (numDeletedLine++ >= addedLines.length) {
                  return (
                    <div className="row deleted">
                      <div className="before">
                        <div className="gutter">{line.oldLineNumber}</div>
                        <div className="content">
                          {syntaxHighlightLine(
                            lineToDiff(line.content),
                            tokens,
                            true
                          )}
                        </div>
                      </div>

                      <div className="after">
                        <div className="gutter">{line.newLineNumber}</div>
                        <div className="content"></div>
                      </div>
                    </div>
                  )
                } else {
                  numModifiedLines++

                  const dmp = new DiffMatchPatch()
                  const diff = dmp.diff_main(
                    line.content,
                    addedLines[numDeletedLine - 1].content
                  )
                  dmp.diff_cleanupSemanticLossless(diff)
                  dmp.diff_cleanupEfficiency(diff)
                  dmp.diff_cleanupMerge(diff)

                  return (
                    <div className="row modified">
                      <div className="before">
                        <div className="gutter">{line.oldLineNumber}</div>
                        <div className="content">
                          {syntaxHighlightLine(diff, tokens, true)}
                        </div>
                      </div>

                      <div className="after">
                        <div className="gutter">
                          {addedLines[numDeletedLine - 1].newLineNumber}
                        </div>
                        <div className="content">
                          {syntaxHighlightLine(
                            diff,
                            getTokensForDiffLine(
                              addedLines[numDeletedLine - 1],
                              this.state.oldTokens,
                              this.state.newTokens
                            ) || [],
                            false
                          )}
                        </div>
                      </div>
                    </div>
                  )
                }
              case DiffLineType.Add:
                if (numModifiedLines-- > 0) {
                  return null
                }

                return (
                  <div className="row added">
                    <div className="before">
                      <div className="gutter">{line.oldLineNumber}</div>
                      <div className="content"></div>
                    </div>
                    <div className="after">
                      <div className="gutter">{line.newLineNumber}</div>
                      <div className="content">
                        {syntaxHighlightLine(
                          lineToDiff(line.content),
                          tokens,
                          false
                        )}
                      </div>
                    </div>
                  </div>
                )
            }
          })
        })}
      </>
    )
  }

  public componentDidMount() {
    this.initDiffSyntaxMode()
  }

  public componentDidUpdate(prevProps: IUnifiedDiffProps) {
    if (!highlightParametersEqual(this.props, prevProps)) {
      this.initDiffSyntaxMode()
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
      oldTokens: tokens.oldTokens,
      newTokens: tokens.newTokens,
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
  newProps: IUnifiedDiffProps,
  prevProps: IUnifiedDiffProps
) {
  return (
    newProps === prevProps ||
    (newProps.file.id === prevProps.file.id &&
      newProps.diff.text === prevProps.diff.text)
  )
}

function syntaxHighlightLine(
  diff: Diff[],
  tokens: ILineTokens | null,
  useBefore: boolean
): JSX.Element | string {
  if (tokens === null) {
    return diffToLine(diff, useBefore)
  }

  const elements = []
  let numChar = 0

  for (const diffEntry of diff) {
    if (
      (useBefore && diffEntry[0] === 1) ||
      (!useBefore && diffEntry[0] === -1)
    ) {
      continue
    }

    let className = ''
    if (useBefore && diffEntry[0] === -1) {
      className = 'char-deleted'
    } else if (!useBefore && diffEntry[0] === 1) {
      className = 'char-added'
    }

    let i = 0
    let currentToken: IToken | null = null

    while (i < diffEntry[1].length) {
      const char = diffEntry[1][i]

      const token: IToken | undefined =
        tokens[numChar + i] || currentToken || undefined

      if (token !== undefined) {
        const text = diffEntry[1].slice(i, i + token.length)

        if (i + token.length > diffEntry[1].length) {
          currentToken = token
        } else {
          currentToken = null
        }

        elements.push(
          <span
            key={numChar + i}
            className={
              token.token
                .split(' ')
                .map(className => `cm-${className}`)
                .join(' ') +
              ' ' +
              className
            }
          >
            {text}
          </span>
        )
        i += Math.min(token.length, diffEntry[1].length)
      } else {
        if (className !== '') {
          elements.push(
            <span key={numChar + i} className={className}>
              {char}
            </span>
          )
        } else {
          elements.push(char)
        }
        i++
      }
    }

    numChar += diffEntry[1].length
  }

  return <>{elements}</>
}

function lineToDiff(line: string): Diff[] {
  return [[0, line]]
}

function diffToLine(diff: Diff[], useBefore: boolean) {
  return diff
    .filter(el => el[0] === 0 || (useBefore ? el[0] === -1 : el[0] === 1))
    .map(el => el[1])
    .join('')
}
