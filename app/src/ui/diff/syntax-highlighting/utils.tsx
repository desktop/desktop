import * as React from 'react'

import { ILineTokens } from '../../../lib/highlighter/types'
import classNames from 'classnames'
import { relativeChanges } from '../changed-range'
import { mapKeysEqual } from '../../../lib/equality'

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
  tokensArray: ReadonlyArray<ILineTokens>
): JSX.Element {
  const elements = []
  let currentElement: {
    content: string
    tokens: Map<string, number>
  } = {
    content: '',
    tokens: new Map(),
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
      if (tokens[i] !== undefined && tokens[i].length > 0) {
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
        classNames: [...currentElement.tokens.keys()].map(name => `cm-${name}`),
        content: currentElement.content,
      })

      currentElement = {
        content: char,
        tokens: newTokens,
      }
    }
  }

  elements.push({
    classNames: [...currentElement.tokens.keys()],
    content: currentElement.content,
  })

  return (
    <>
      {elements.map((element, i) => {
        if (element.classNames.length === 0) {
          return element.content
        }
        return (
          <span key={i} className={classNames(element.classNames)}>
            {element.content}
          </span>
        )
      })}
    </>
  )
}
