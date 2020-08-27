// tslint:disable: react-unused-props-and-state

import * as React from 'react'
import { Repository } from '../../models/repository'
import {
  ITextDiff,
  DiffSelection,
  DiffLineType,
  DiffHunk,
  DiffLine,
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
import { ITokens, ILineTokens, IToken } from '../../lib/highlighter/types'
import { DiffMatchPatch, Diff } from 'diff-match-patch-typescript'
import { assertNever } from '../../lib/fatal-error'

type ChangedFile = WorkingDirectoryFileChange | CommittedFileChange

const MaxLineLengthToCalculateDiff = 240

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

  public componentDidMount() {
    this.initDiffSyntaxMode()
  }

  public componentDidUpdate(prevProps: IUnifiedDiffProps) {
    if (!highlightParametersEqual(this.props, prevProps)) {
      this.initDiffSyntaxMode()
    }
  }

  public render() {
    return (
      <div className="unified-diff-container">
        <div className="unified-diff cm-s-default">
          {this.props.diff.hunks.map(hunk => this.renderHunk(hunk))}
        </div>
      </div>
    )
  }

  private renderHunk(hunk: DiffHunk) {
    const rows: Array<JSX.Element> = []
    let addedDeletedLines: Array<DiffLine> = []

    for (const line of hunk.lines) {
      if (line.type === DiffLineType.Delete || line.type === DiffLineType.Add) {
        addedDeletedLines.push(line)
        continue
      }

      if (addedDeletedLines.length > 0) {
        rows.push(...this.renderAddedDeletedLines(addedDeletedLines))

        addedDeletedLines = []
      }

      if (line.type === DiffLineType.Hunk) {
        rows.push(
          <div className="row hunk-info">
            <div className="gutter"></div>
            <div className="content">{line.content}</div>
          </div>
        )
        continue
      }

      if (line.type === DiffLineType.Context) {
        const tokens =
          getTokensForDiffLine(
            line,
            this.state.oldTokens,
            this.state.newTokens
          ) || []

        const highlightedContent = syntaxHighlightLine(
          lineToDiff(line.content),
          tokens,
          true
        )

        rows.push(
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
        continue
      }

      assertNever(line.type, `Invalid line type: ${line.type}`)
    }

    if (addedDeletedLines.length > 0) {
      rows.push(...this.renderAddedDeletedLines(addedDeletedLines))
    }

    return rows
  }

  private renderAddedDeletedLines(
    addedDeletedLines: ReadonlyArray<DiffLine>
  ): ReadonlyArray<JSX.Element> {
    const addedLines = addedDeletedLines.filter(
      line => line.type === DiffLineType.Add
    )
    const deletedLines = addedDeletedLines.filter(
      line => line.type === DiffLineType.Delete
    )
    const shouldDisplayDiff = addedLines.length === deletedLines.length
    const output: Array<JSX.Element> = []

    for (
      let numLine = 0;
      numLine < addedLines.length || numLine < deletedLines.length;
      numLine++
    ) {
      if (numLine >= deletedLines.length) {
        // Added line
        const line = addedLines[numLine]
        const tokens =
          getTokensForDiffLine(
            line,
            this.state.oldTokens,
            this.state.newTokens
          ) || []

        output.push(
          <div className="row added">
            <div className="before">
              <div className="gutter">{line.oldLineNumber}</div>
              <div className="content"></div>
            </div>
            <div className="after">
              <div className="gutter">{line.newLineNumber}</div>
              <div className="content">
                {syntaxHighlightLine(lineToDiff(line.content), tokens, false)}
              </div>
            </div>
          </div>
        )
      } else if (numLine >= addedLines.length) {
        // Deleted line
        const line = deletedLines[numLine]
        const tokens =
          getTokensForDiffLine(
            line,
            this.state.oldTokens,
            this.state.newTokens
          ) || []

        output.push(
          <div className="row deleted">
            <div className="before">
              <div className="gutter">{line.oldLineNumber}</div>
              <div className="content">
                {syntaxHighlightLine(lineToDiff(line.content), tokens, true)}
              </div>
            </div>

            <div className="after">
              <div className="gutter">{line.newLineNumber}</div>
              <div className="content"></div>
            </div>
          </div>
        )
      } else {
        // Modified line
        const lineBefore = deletedLines[numLine]
        const tokensBefore =
          getTokensForDiffLine(
            lineBefore,
            this.state.oldTokens,
            this.state.newTokens
          ) || []
        const lineAfter = addedLines[numLine]
        const tokensAfter =
          getTokensForDiffLine(
            lineAfter,
            this.state.oldTokens,
            this.state.newTokens
          ) || []

        let diffBefore
        let diffAfter

        if (
          shouldDisplayDiff &&
          lineBefore.content.length < MaxLineLengthToCalculateDiff &&
          lineAfter.content.length < MaxLineLengthToCalculateDiff
        ) {
          const dmp = new DiffMatchPatch()
          const diff = (diffAfter = dmp.diff_main(
            lineBefore.content,
            lineAfter.content
          ))

          dmp.diff_cleanupSemanticLossless(diff)
          dmp.diff_cleanupEfficiency(diff)
          dmp.diff_cleanupMerge(diff)

          diffBefore = diffAfter = diff
        } else {
          diffBefore = lineToDiff(lineBefore.content)
          diffAfter = lineToDiff(lineAfter.content)
        }

        output.push(
          <div className="row modified">
            <div className="before">
              <div className="gutter">{lineBefore.oldLineNumber}</div>
              <div className="content">
                {syntaxHighlightLine(diffBefore, tokensBefore, true)}
              </div>
            </div>

            <div className="after">
              <div className="gutter">{lineAfter.newLineNumber}</div>
              <div className="content">
                {syntaxHighlightLine(diffAfter, tokensAfter, false)}
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
