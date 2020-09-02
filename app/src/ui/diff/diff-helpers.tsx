import * as React from 'react'

import { ILineTokens } from '../../lib/highlighter/types'
import classNames from 'classnames'
import { relativeChanges } from './changed-range'
import { mapKeysEqual } from '../../lib/equality'
import {
  WorkingDirectoryFileChange,
  CommittedFileChange,
} from '../../models/status'

export interface ISelection {
  readonly from: number
  readonly to: number
  readonly isSelected: boolean
}

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

export type ChangedFile = WorkingDirectoryFileChange | CommittedFileChange

/**
 * Returns an object with two ILineTokens objects that can be used to highlight
 * the added and removed characters between two lines.
 *
 * The `before` object contains the tokens to be used against the `lineBefore` string
 * while the `after` object contains the tokens to use with the `lineAfter` string.
 *
 * This method can be used in conjunction with the `syntaxHighlightLine()` method to
 * get the difference between two lines highlighted:
 *
 * syntaxHighlightLine(
 *   lineBefore,
 *   getDiffTokens(lineBefore, lineAfter).before
 * )
 *
 * @param lineBefore    The first version of the line to compare.
 * @param lineAfter     The second version of the line to compare.
 */
export function getDiffTokens(
  lineBefore: string,
  lineAfter: string
): { before: ILineTokens; after: ILineTokens } {
  const changeRanges = relativeChanges(lineBefore, lineAfter)

  return {
    before: {
      [changeRanges.stringARange.location]: {
        token: 'diff-delete-inner',
        length: changeRanges.stringARange.length,
      },
    },
    after: {
      [changeRanges.stringBRange.location]: {
        token: 'diff-add-inner',
        length: changeRanges.stringBRange.length,
      },
    },
  }
}

/**
 * Returns an JSX element with syntax highlighting of the passed line using both
 * the syntaxTokens and diffTokens.
 *
 * @param line          The line to syntax highlight.
 * @param tokensArray   An array of ILineTokens objects that is used for syntax highlighting.
 */
export function syntaxHighlightLine(
  line: string,
  ...tokensArray: ReadonlyArray<ILineTokens | null>
): JSX.Element {
  const elements = []
  let currentElement = {
    content: '',
    tokens: new Map<string, number>(),
  }

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const newTokens = new Map<string, number>()

    for (const [token, endPosition] of currentElement.tokens) {
      if (endPosition > i) {
        newTokens.set(token, endPosition)
      }
    }

    for (const tokens of tokensArray) {
      if (tokens !== null && tokens[i] !== undefined && tokens[i].length > 0) {
        // ILineTokens can contain multiple tokens separated by spaces.
        // We split them to avoid creating unneeded HTML elements when
        // these tokens do not maintain the same order.
        const tokenNames = tokens[i].token.split(' ')
        const position = i + tokens[i].length

        for (const name of tokenNames) {
          const existingTokenPosition = newTokens.get(name)

          // While it's rare, it's theoretically possible that the same
          // token exists for the same start position with different end
          // positions. If this happens, we choose the longest one.
          if (
            existingTokenPosition === undefined ||
            position > existingTokenPosition
          ) {
            newTokens.set(name, position)
          }
        }
      }
    }

    if (mapKeysEqual(currentElement.tokens, newTokens)) {
      currentElement.content += char
    } else {
      elements.push({
        tokens: currentElement.tokens,
        content: currentElement.content,
      })

      currentElement = {
        content: char,
        tokens: newTokens,
      }
    }
  }

  // Add the remaining current element to the list of elements.
  elements.push({
    tokens: currentElement.tokens,
    content: currentElement.content,
  })

  return (
    <>
      {elements.map((element, i) => {
        if (element.tokens.size === 0) {
          return element.content
        }
        return (
          <span
            key={i}
            className={classNames(
              [...element.tokens.keys()].map(name => `cm-${name}`)
            )}
          >
            {element.content}
          </span>
        )
      })}
    </>
  )
}

export function getDiffData(row: DiffRow, targetElement?: Element) {
  if (row.type === DiffRowType.Added || row.type === DiffRowType.Deleted) {
    return row.data
  }

  if (row.type !== DiffRowType.Modified) {
    return null
  }

  return targetElement?.closest('.after') ? row.afterData : row.beforeData
}

/** Utility function for checking whether a file supports selection */
export function canSelect(
  file: ChangedFile
): file is WorkingDirectoryFileChange {
  return file instanceof WorkingDirectoryFileChange
}

export function isInTemporarySelection(
  s: ISelection | undefined,
  ix: number
): s is ISelection {
  if (s === undefined) {
    return false
  }
  return ix >= Math.min(s.from, s.to) && ix <= Math.max(s.to, s.from)
}
