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
const RowHeight = 20

/**
 * The amount to offset on the Y axis so that the popup is displayed below the
 * current line.
 */
const YOffset = 20

interface IAutocompletingTextAreaState<T> {
  readonly autocompletionState: IAutocompletionState<T> | null
}

/** A text area which provides autocompletions as the user types. */
export default class AutocompletingTextArea extends React.Component<IAutocompletingTextAreaProps, IAutocompletingTextAreaState<any>> {
  private textArea: HTMLTextAreaElement | null = null
  private autocompletionList: List | null = null

  /** The row to scroll to. -1 means the list shouldn't scroll. */
  private scrollToRow = -1

  private providers: ReadonlyArray<IAutocompletionProvider<any>>

  public constructor(props: IAutocompletingTextAreaProps) {
    super(props)

    this.providers = [
      new EmojiAutocompletionProvider(props.emoji),
    ]

    this.state = { autocompletionState: null }
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
    const state = this.state.autocompletionState
    if (!state) { return null }

    const items = state.items
    if (!items.length) { return null }

    const scrollToRow = this.scrollToRow
    this.scrollToRow = -1

    const coordinates = getCaretCoordinates(this.textArea!, state.range.start)
    const left = coordinates.left
    const top = coordinates.top + YOffset
    const selectedRow = items.indexOf(state.selectedItem)

    return (
      <div className='autocompletion-popup' style={{ top, left }}>
        <List ref={ref => this.autocompletionList = ref}
              rowCount={items.length}
              rowHeight={RowHeight}
              selectedRow={selectedRow}
              rowRenderer={row => this.renderItem(state, row)}
              scrollToRow={scrollToRow}
              onSelectionChanged={row => this.insertCompletion(items[row])}/>
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
                  onKeyDown={event => this.onKeyDown(event)}/>
      </div>
    )
  }

  private insertCompletion(item: string) {
    const textArea = this.textArea!
    const autocompletionState = this.state.autocompletionState!
    const originalText = textArea.value
    const range = autocompletionState.range
    const newText = originalText.substr(0, range.start - 1) + item + originalText.substr(range.start + range.length) + ' '
    textArea.value = newText

    if (this.props.onChange) {
      // This is gross, I feel gross, etc.
      this.props.onChange({
          bubbles: false,
          currentTarget: textArea,
          cancelable: false,
          defaultPrevented: true,
          eventPhase: 1,
          isTrusted: true,
          nativeEvent: new KeyboardEvent('keydown'),
          preventDefault: () => {},
          isDefaultPrevented: () => true,
          stopPropagation: () => {},
          isPropagationStopped: () => true,
          persist: () => {},
          target: textArea,
          timeStamp: new Date(),
          type: 'keydown',
      })
    }

    this.setState({ autocompletionState: null })

    // More gross. Clicking on the list moves focus off the text area.
    // Immediately moving focus back doesn't work. Gotta wait a runloop I guess?
    setTimeout(() => this.textArea!.focus(), 0)
  }

  private getMovementDirection(event: React.KeyboardEvent<any>): 'up' | 'down' | null {
    switch (event.key) {
      case 'ArrowUp': return 'up'
      case 'ArrowDown': return 'down'
    }

    return null
  }

  private onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (this.props.onKeyDown) {
      this.props.onKeyDown(event)
    }

    const state = this.state.autocompletionState
    if (!state) { return }

    const selectedRow = state.items.indexOf(state.selectedItem)
    const direction = this.getMovementDirection(event)
    if (direction) {
      event.preventDefault()

      const nextRow = this.autocompletionList!.nextSelectableRow(direction, selectedRow)
      this.scrollToRow = nextRow
      this.setState({ autocompletionState: {
        provider: state.provider,
        items: state.items,
        range: state.range,
        selectedItem: state.items[nextRow],
      } })
    } else if (event.key === 'Enter') {
      event.preventDefault()

      this.insertCompletion(state.selectedItem)
    } else if (event.key === 'Escape') {
      this.setState({ autocompletionState: null })
    }
  }

  private attemptAutocompletion(str: string, caretPosition: number): IAutocompletionState<any> | null {
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
          return { provider, items, range, selectedItem }
        }
      }
    }

    return null
  }

  private onChange(event: React.FormEvent<HTMLTextAreaElement>) {
    if (this.props.onChange) {
      this.props.onChange(event)
    }

    const str = event.currentTarget.value
    const caretPosition = this.textArea!.selectionStart
    const autocompletionState = this.attemptAutocompletion(str, caretPosition)
    this.setState({ autocompletionState })
  }
}
