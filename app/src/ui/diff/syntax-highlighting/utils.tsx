import * as React from 'react'

import {
  Diff,
  DiffOperation,
  DiffMatchPatch,
} from 'diff-match-patch-typescript'
import { ILineTokens } from '../../../lib/highlighter/types'
import classNames from 'classnames'

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
 *   undefined,
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
  const dmp = new DiffMatchPatch()
  const diff = dmp.diff_main(lineBefore, lineAfter)

  dmp.diff_cleanupSemanticLossless(diff)
  dmp.diff_cleanupEfficiency(diff)
  dmp.diff_cleanupMerge(diff)

  return {
    before: convertDiffToTokens(diff, DiffOperation.DIFF_DELETE),
    after: convertDiffToTokens(diff, DiffOperation.DIFF_INSERT),
  }
}

function convertDiffToTokens(
  diff: Diff[],
  diffOperation: DiffOperation
): ILineTokens {
  const output: ILineTokens = []

  let startIndex = 0
  for (const [type, content] of diff) {
    if (type === DiffOperation.DIFF_EQUAL) {
      startIndex += content.length
      continue
    }

    if (type !== diffOperation) {
      continue
    }

    const tokenName =
      diffOperation === DiffOperation.DIFF_DELETE
        ? 'cm-diff-delete-inner'
        : 'cm-diff-add-inner'

    output[startIndex] = { token: tokenName, length: content.length }

    startIndex += content.length
  }

  return output
}

/**
 * Returns an JSX element with syntax highlighting of the passed line using both
 * the syntaxTokens and diffTokens.
 *
 * @param line          The line to syntax highlight.
 * @param syntaxTokens  The ILineTokens object that corresponds to highlight syntax.
 * @param diffTokens    The ILineTokens object that's used to highlight differences.
 */
export function syntaxHighlightLine(
  line: string,
  syntaxTokens?: ILineTokens,
  diffTokens?: ILineTokens
): JSX.Element {
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
