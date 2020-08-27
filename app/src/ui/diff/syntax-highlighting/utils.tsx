import * as React from 'react'

import {
  Diff,
  DIFF_EQUAL,
  DIFF_DELETE,
  DIFF_INSERT,
  diff_match_patch,
} from 'diff-match-patch'
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
 *   [getDiffTokens(lineBefore, lineAfter).before]
 * )
 *
 * @param lineBefore    The first version of the line to compare.
 * @param lineAfter     The second version of the line to compare.
 */
export function getDiffTokens(
  lineBefore: string,
  lineAfter: string
): { before: ILineTokens; after: ILineTokens } {
  const dmp = new diff_match_patch()
  const diff = dmp.diff_main(lineBefore, lineAfter)

  dmp.diff_cleanupMerge(diff)
  dmp.diff_cleanupSemanticLossless(diff)

  return {
    before: convertDiffToTokens(diff, DIFF_DELETE),
    after: convertDiffToTokens(diff, DIFF_INSERT),
  }
}

function convertDiffToTokens(diff: Diff[], diffOperation: number): ILineTokens {
  const output: ILineTokens = []

  let startIndex = 0
  for (const [type, content] of diff) {
    if (type === DIFF_EQUAL) {
      startIndex += content.length
      continue
    }

    if (type !== diffOperation) {
      continue
    }

    const tokenName =
      diffOperation === DIFF_DELETE ? 'diff-delete-inner' : 'diff-add-inner'

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
 * @param tokensArray   An array of ILineTokens objects that is used for syntax highlighting.
 */
export function syntaxHighlightLine(
  line: string,
  tokensArray: ReadonlyArray<ILineTokens>
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

    for (const tokens of tokensArray) {
      if (tokens[i] !== undefined) {
        tokensToAdd.push({
          name: tokens[i].token
            .split(' ')
            .map(name => `cm-${name}`)
            .join(' '),
          endPosition: i + tokens[i].length,
        })
      }
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
