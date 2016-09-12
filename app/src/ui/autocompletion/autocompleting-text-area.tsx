import * as React from 'react'
import List from '../list'
import { IAutocompletionProvider } from './index'
import EmojiAutocompletionProvider from './emoji-autocompletion-provider'

interface IPosition {
  readonly top: number
  readonly left: number
}

interface IRange {
  readonly start: number
  readonly length: number
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

interface IAutocompletionState<T> {
  readonly provider: IAutocompletionProvider<T>
  readonly items: ReadonlyArray<T>
  readonly range: IRange
  readonly selectedItem: T | null
}

/** The height of the autocompletion result rows. */
const RowHeight = 16

interface IAutocompletingTextAreaState<T> {
  readonly state: IAutocompletionState<T> | null
  readonly text: string
}

export default class AutocompletingTextArea extends React.Component<IAutocompletingTextAreaProps, IAutocompletingTextAreaState<any>> {
  private textArea: HTMLTextAreaElement | null = null
  private autocompletionList: List | null = null
  private scrollToRow = -1

  private providers: ReadonlyArray<IAutocompletionProvider<any>>

  public constructor(props: IAutocompletingTextAreaProps) {
    super(props)

    this.providers = [
      new EmojiAutocompletionProvider(props.emoji),
    ]

    this.state = { state: null, text: '' }
  }

  private renderItem<T>(state: IAutocompletionState<T>, row: number) {
    const item = state.items[row]
    const selected = item === state.selectedItem ? 'selected' : ''
    return (
      <div className={`autocompletion-item ${selected}`}>
        {state.provider.renderItem(item)}
      </div>
    )
  }

  private renderAutocompletions() {
    const state = this.state.state
    if (!state) { return null }

    const scrollToRow = this.scrollToRow
    this.scrollToRow = -1

    const items = state.items
    const coordinates = getCaretCoordinates(this.textArea!, state.range.start)
    const left = coordinates.left
    const top = coordinates.top + 20
    const selectedRow = items.indexOf(state.selectedItem)

    return (
      <div className='autocompletion-popup' style={{ top, left }}>
        <List ref={ref => this.autocompletionList = ref}
              rowCount={items.length}
              rowHeight={RowHeight}
              selectedRow={selectedRow}
              rowRenderer={row => this.renderItem(state, row)}
              scrollToRow={scrollToRow}/>
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
                  value={this.props.value || this.state.text}
                  onChange={event => this.onChange(event)}
                  onKeyDown={event => this.onKeyDown(event)}/>
      </div>
    )
  }

  private onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (this.props.onKeyDown) {
      this.props.onKeyDown(event)
    }

    const state = this.state.state
    if (!state) { return }

    const selectedRow = state.items.indexOf(state.selectedItem)

    if (event.key === 'ArrowUp') {
      const nextRow = this.autocompletionList!.nextSelectableRow('up', selectedRow)
      this.scrollToRow = nextRow
      this.setState({ state: { provider: state.provider, items: state.items, range: state.range, selectedItem: state.items[nextRow] }, text: this.state.text })
      event.preventDefault()
    } else if (event.key === 'ArrowDown') {
      const nextRow = this.autocompletionList!.nextSelectableRow('down', selectedRow)
      this.scrollToRow = nextRow
      this.setState({ state: { provider: state.provider, items: state.items, range: state.range, selectedItem: state.items[nextRow] }, text: this.state.text })
      event.preventDefault()
    } else if (event.key === 'Enter') {
      const originalText = this.state.text
      const newText = originalText.substr(0, state.range.start - 1) + state.selectedItem + originalText.substr(state.range.start + state.range.length) + ' '

      const nativeEvent = event.nativeEvent
      event.persist()
      event.preventDefault()
      this.setState({ state: null, text: newText }, () => {
        if (this.props.onChange) {
          this.props.onChange(nativeEvent as any)
        }
      })
    }
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
          const range = { start: index - text.length, length: text.length }
          const items = provider.getAutocompletionItems(text)

          const selectedItem = items[0]
          this.setState({ state: { provider, items, range, selectedItem }, text: event.currentTarget.value })
          return
        }
      }
    }

    this.setState({ state: null, text: event.currentTarget.value })
  }
}
