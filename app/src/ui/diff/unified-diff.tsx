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
import { ITokens, ILineTokens } from '../../lib/highlighter/types'
import {
  DiffMatchPatch,
  Diff,
  DiffOperation,
} from 'diff-match-patch-typescript'
import { assertNever } from '../../lib/fatal-error'
import classNames from 'classnames'

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
          ) ?? undefined

        const highlightedContent = syntaxHighlightLine(line.content, tokens)

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
          ) ?? undefined

        output.push(
          <div className="row added">
            <div className="before">
              <div className="gutter"></div>
              <div className="content"></div>
            </div>
            <div className="after">
              <div className="gutter">{line.newLineNumber}</div>
              <div className="content">
                {syntaxHighlightLine(line.content, tokens)}
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
                {syntaxHighlightLine(line.content, tokens)}
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

        let diffTokensBefore
        let diffTokensAfter

        if (
          shouldDisplayDiff &&
          lineBefore.content.length < MaxLineLengthToCalculateDiff &&
          lineAfter.content.length < MaxLineLengthToCalculateDiff
        ) {
          const dmp = new DiffMatchPatch()
          const diff = dmp.diff_main(lineBefore.content, lineAfter.content)

          dmp.diff_cleanupSemanticLossless(diff)
          dmp.diff_cleanupEfficiency(diff)
          dmp.diff_cleanupMerge(diff)

          diffTokensBefore = convertDiffToTokens(diff, true)
          diffTokensAfter = convertDiffToTokens(diff, false)
        }

        output.push(
          <div className="row modified">
            <div className="before">
              <div className="gutter">{lineBefore.oldLineNumber}</div>
              <div className="content">
                {syntaxHighlightLine(
                  lineBefore.content,
                  tokensBefore,
                  diffTokensBefore
                )}
              </div>
            </div>

            <div className="after">
              <div className="gutter">{lineAfter.newLineNumber}</div>
              <div className="content">
                {syntaxHighlightLine(
                  lineAfter.content,
                  tokensAfter,
                  diffTokensAfter
                )}
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

function convertDiffToTokens(diff: Diff[], useBefore: boolean): ILineTokens {
  const output: ILineTokens = []

  let startIndex = 0
  for (const [type, content] of diff) {
    if (
      (useBefore && type === DiffOperation.DIFF_INSERT) ||
      (!useBefore && type === DiffOperation.DIFF_DELETE)
    ) {
      continue
    }

    let tokenName
    if (type === DiffOperation.DIFF_DELETE) {
      tokenName = 'cm-diff-delete-inner'
    } else if (type === DiffOperation.DIFF_INSERT) {
      tokenName = 'cm-diff-add-inner'
    }

    if (tokenName !== undefined) {
      output[startIndex] = { token: tokenName, length: content.length }
    }

    startIndex += content.length
  }

  return output
}

function syntaxHighlightLine(
  line: string,
  syntaxTokens?: ILineTokens,
  diffTokens?: ILineTokens
): JSX.Element | string {
  const elements = []
  let currentElement: {
    content: string
    tokens: Array<{ name: string; endPosition: number }>
  } = {
    content: '',
    tokens: [],
  }

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    const tokensToRemove = currentElement.tokens.filter(
      token => token.endPosition === i
    )

    const tokensToAdd = []
    if (syntaxTokens !== undefined && syntaxTokens[i] !== undefined) {
      tokensToAdd.push({
        name: syntaxTokens[i].token
          .split(' ')
          .map(name => `cm-${name}`)
          .join(' '),
        endPosition: i + syntaxTokens[i].length,
      })
    }
    if (diffTokens !== undefined && diffTokens[i] !== undefined) {
      tokensToAdd.push({
        name: diffTokens[i].token,
        endPosition: i + diffTokens[i].length,
      })
    }

    if (tokensToRemove.length === 0 && tokensToAdd.length === 0) {
      currentElement.content += char
    } else {
      elements.push({
        classNames: currentElement.tokens.map(token => token.name),
        content: currentElement.content,
      })
      currentElement = {
        content: char,
        tokens: [
          ...currentElement.tokens.filter(token => token.endPosition !== i),
          ...tokensToAdd,
        ],
      }
    }
  }

  elements.push({
    classNames: currentElement.tokens.map(token => token.name),
    content: currentElement.content,
  })

  return (
    <>
      {elements.map((element, i) => (
        <span key={i} className={classNames(element.classNames)}>
          {element.content}
        </span>
      ))}
    </>
  )
}
