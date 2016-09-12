import * as React from 'react'
import List from '../list'
import { IAutocompletionProvider } from './index'
import EmojiAutocompletionProvider from './emoji-autocompletion-provider'

interface IPosition {
  readonly top: number
  readonly left: number
}

const getCaretCoordinates: (element: HTMLElement, position: number) => IPosition = require('textarea-caret')

interface IAutocompletingTextAreaProps {
  readonly className?: string
  readonly placeholder?: string
  readonly value?: string
  readonly onChange?: (event: React.FormEvent<HTMLTextAreaElement>) => void
  readonly onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void
  readonly emoji: Map<string, string>
}

type AutocompletionState = { provider: IAutocompletionProvider<any>, text: string, position: IPosition }

/** The height of the autocompletion result rows. */
const RowHeight = 16

interface IAutocompletingTextAreaState {
  readonly state: AutocompletionState | null
}

export default class AutocompletingTextArea extends React.Component<IAutocompletingTextAreaProps, IAutocompletingTextAreaState> {
  private textArea: HTMLTextAreaElement | null = null
  private providers: ReadonlyArray<IAutocompletionProvider<any>>

  public constructor(props: IAutocompletingTextAreaProps) {
    super(props)

    this.providers = [
      new EmojiAutocompletionProvider(props.emoji),
    ]

    this.state = { state: null }
  }

  private renderAutocompletions() {
    const state = this.state.state
    if (!state) { return null }

    const provider = state.provider
    const items = provider.getAutocompletionItems(state.text)
    const { top, left } = state.position
    return (
      <div className='autocompletion-popup' style={{ top, left }}>
        <List rowCount={items.length} rowHeight={RowHeight} selectedRow={-1} rowRenderer={row => provider.renderItem(items[row])}/>
      </div>
    )
  }

  public render() {
    return (
      <div className='autocompletion-container'>
        {this.renderAutocompletions()}

        <textarea ref={ref => this.textArea = ref}
                  className={this.props.className}
                  placeholder={this.props.placeholder}
                  value={this.props.value}
                  onChange={event => this.onChange(event)}
                  onKeyDown={this.props.onKeyDown}/>
      </div>
    )
  }

  private onChange(event: React.FormEvent<HTMLTextAreaElement>) {
    if (this.props.onChange) {
      this.props.onChange(event)
    }

    const textArea = this.textArea!
    const caretPosition = textArea.selectionStart

    const str = event.currentTarget.value
    for (const provider of this.providers) {
      const regex = provider.getRegExp()
      let result: RegExpExecArray | null = null
      while (result = regex.exec(str)) {
        const index = regex.lastIndex
        const text = result[3]
        if (!text) { continue }

        if (index === caretPosition) {
          let position: IPosition = getCaretCoordinates(textArea, index - text.length)
          position = { top: position.top + 20, left: position.left }
          this.setState({ state: { provider, position, text } })
          return
        }
      }
    }

    this.setState({ state: null })
  }
}
