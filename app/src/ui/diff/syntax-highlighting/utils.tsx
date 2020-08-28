import * as React from 'react'

import { ILineTokens } from '../../../lib/highlighter/types'
import classNames from 'classnames'
import { relativeChanges } from '../changed-range'

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
    tokens: Array<{ name: string; endPosition: number }>
  } = {
    content: '',
    tokens: [],
  }

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    const tokensToRemove = currentElement.tokens.filter(
      token => token.endPosition <= i
    )

    const tokensToAdd = []

    for (const tokens of tokensArray) {
      if (tokens[i] !== undefined && tokens[i].length > 0) {
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
          ...currentElement.tokens.filter(token => token.endPosition > i),
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
