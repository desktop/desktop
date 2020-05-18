import * as React from 'react'

// broken for SFCs: https://github.com/Microsoft/tslint-microsoft-contrib/issues/339
/* tslint:disable react-unused-props-and-state */

interface IHighlightTextProps {
  /** The text to render */
  readonly text: string
  /** The characters in `text` to highlight */
  readonly highlight: ReadonlyArray<number>
}

export const HighlightText: React.FunctionComponent<IHighlightTextProps> = ({
  text,
  highlight,
}) => (
  <span>
    {
      text
        .split('')
        .map((ch, i): [string, boolean] => [ch, highlight.includes(i)])
        .concat([['', false]])
        .reduce(
          (state, [ch, matched], i, arr) => {
            if (matched === state.matched && i < arr.length - 1) {
              state.str += ch
            } else {
              const Component = state.matched ? 'mark' : 'span'
              state.result.push(<Component key={i}>{state.str}</Component>)
              state.str = ch
              state.matched = matched
            }
            return state
          },
          {
            matched: false,
            str: '',
            result: new Array<React.ReactElement<any>>(),
          }
        ).result
    }
  </span>
)
