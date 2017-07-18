import * as React from 'react'
import { List, SelectionSource } from '../list'
import { IAutocompletionProvider } from './index'
import { fatalError } from '../../lib/fatal-error'
import  * as classNames from 'classnames'

interface IPosition {
  readonly top: number
  readonly left: number
}

interface IRange {
  readonly start: number
  readonly length: number
}

const getCaretCoordinates: (element: HTMLElement, position: number) => IPosition = require('textarea-caret')

interface IAutocompletingTextInputProps<ElementType> {
  /**
   * An optional className to be applied to the rendered
   * top level element of the component.
   */
  readonly className?: string

  /** The placeholder for the input field. */
  readonly placeholder?: string

  /** The current value of the input field. */
  readonly value?: string

  /**
   * Called when the user changes the value in the input field.
   */
  readonly onValueChanged?: (value: string) => void

  /** Called on key down. */
  readonly onKeyDown?: (event: React.KeyboardEvent<ElementType>) => void

  /**
   * A list of autocompletion providers that should be enabled for this
   * input.
   */
  readonly autocompletionProviders: ReadonlyArray<IAutocompletionProvider<any>>
}

interface IAutocompletionState<T> {
  readonly provider: IAutocompletionProvider<T>
  readonly items: ReadonlyArray<T>
  readonly range: IRange
  readonly rangeText: string
  readonly selectedItem: T | null
}

/**
 * The height of the autocompletion result rows.
 */
const RowHeight = 29

/**
 * The amount to offset on the Y axis so that the popup is displayed below the
 * current line.
 */
const YOffset = 20

/**
 * The default height for the popup. Note that the actual height may be
 * smaller in order to fit the popup within the window.
 */
const DefaultPopupHeight = 100

interface IAutocompletingTextInputState<T> {
  /**
   * All of the state about autocompletion. Will be null if there are no
   * matching autocompletion providers.
   */
  readonly autocompletionState: IAutocompletionState<T> | null
}

/** A text area which provides autocompletions as the user types. */
export abstract class AutocompletingTextInput<ElementType extends HTMLInputElement | HTMLTextAreaElement> extends React.Component<IAutocompletingTextInputProps<ElementType>, IAutocompletingTextInputState<Object>> {
  private element: ElementType | null = null
  private autocompletionList: List | null = null

  /** The identifier for each autocompletion request. */
  private autocompletionRequestID = 0

  public constructor(props: IAutocompletingTextInputProps<ElementType>) {
    super(props)

    this.state = { autocompletionState: null }
  }

  private renderItem = (row: number): JSX.Element | null => {
    const state = this.state.autocompletionState
    if (!state) { return null }

    const item = state.items[row]
    const selected = item === state.selectedItem ? 'selected' : ''
    return (
      <div className={`autocompletion-item ${selected}`}>
        {state.provider.renderItem(item)}
      </div>
    )
  }

  private storeAutocompletionListRef = (ref: List) => {
    this.autocompletionList = ref
  }

  private renderAutocompletions() {
    const state = this.state.autocompletionState
    if (!state) { return null }

    const items = state.items
    if (!items.length) { return null }

    const element = this.element!
    let coordinates = getCaretCoordinates(element, state.range.start)
    coordinates = { top: coordinates.top - element.scrollTop, left: coordinates.left - element.scrollLeft }

    const left = coordinates.left
    const top = coordinates.top + YOffset
    const selectedRow = state.selectedItem ? items.indexOf(state.selectedItem) : -1
    const rect = element.getBoundingClientRect()
    const popupAbsoluteTop = rect.top + coordinates.top
    const windowHeight = element.ownerDocument.defaultView.innerHeight
    const spaceToBottomOfWindow = windowHeight - popupAbsoluteTop - YOffset

    // The maximum height we can use for the popup without it extending beyond
    // the Window bounds.
    const maxHeight = Math.min(DefaultPopupHeight, spaceToBottomOfWindow)

    // The height needed to accomodate all the matched items without overflowing
    //
    // Magic number warning! The autocompletion-popup container adds a border
    // which we have to account for in case we want to show N number of items
    // without overflowing and triggering the scrollbar.
    const noOverflowItemHeight = (RowHeight * items.length)

    const height = Math.min(noOverflowItemHeight, maxHeight)

    // Use the completion text as invalidation props so that highlighting
    // will update as you type even though the number of items matched
    // remains the same. Additionally we need to be aware that different
    // providers can use different sorting behaviors which also might affect
    // rendering.
    const searchText = state.rangeText

    const className = classNames(
      'autocompletion-popup',
      state.provider.kind,
    )

    return (
      <div className={className} style={{ top, left, height }}>
        <List ref={this.storeAutocompletionListRef}
              rowCount={items.length}
              rowHeight={RowHeight}
              selectedRow={selectedRow}
              rowRenderer={this.renderItem}
              scrollToRow={selectedRow}
              selectOnHover={true}
              focusOnHover={false}
              onRowClick={this.insertCompletionOnClick}
              onSelectionChanged={this.onSelectionChanged}
              invalidationProps={searchText}/>
      </div>
    )
  }

  private onSelectionChanged = (row: number, source: SelectionSource) => {
    const currentAutoCompletionState = this.state.autocompletionState

    if (!currentAutoCompletionState) {
      return
    }

    const newSelectedItem = currentAutoCompletionState.items[row]

    const newAutoCompletionState = {
      ...currentAutoCompletionState,
      selectedItem: newSelectedItem,
    }

    this.setState({ autocompletionState: newAutoCompletionState })
  }

  private insertCompletionOnClick = (row: number): void => {
    const state = this.state.autocompletionState
    if (!state) { return }

    const items = state.items
    if (!items.length) { return }

    const item = items[row]

    this.insertCompletion(item)

    // This is pretty gross. Clicking on the list moves focus off the text area.
    // Immediately moving focus back doesn't work. Gotta wait a runloop I guess?
    setTimeout(() => {
      const element = this.element
      if (element) {
        element.focus()
      }
    }, 0)
  }

  /**
   * To be implemented by subclasses. It must return the element tag name which
   * should correspond to the ElementType over which it is parameterized.
   */
  protected abstract getElementTagName(): 'textarea' | 'input'

  private renderTextInput() {
    return React.createElement<any, any>(this.getElementTagName(), {
      ref: (ref: ElementType) => this.element = ref,
      type: 'text',
      placeholder: this.props.placeholder,
      value: this.props.value,
      onChange: this.onChange,
      onKeyDown: this.onKeyDown,
    })
  }

  public render() {
    const tagName = this.getElementTagName()
    const className = classNames('autocompletion-container', this.props.className, {
      'text-box-component': tagName === 'input',
      'text-area-component': tagName === 'textarea',
    })
    return (
      <div className={className}>
        {this.renderAutocompletions()}

        {this.renderTextInput()}
      </div>
    )
  }

  private insertCompletion(item: Object) {
    const element = this.element!
    const autocompletionState = this.state.autocompletionState!
    const originalText = element.value
    const range = autocompletionState.range
    const autoCompleteText = autocompletionState.provider.getCompletionText(item)
    const newText = originalText.substr(0, range.start - 1) + autoCompleteText + originalText.substr(range.start + range.length) + ' '
    element.value = newText

    if (this.props.onValueChanged) {
      this.props.onValueChanged(newText)
    }

    this.setState({ autocompletionState: null })
  }

  private getMovementDirection(event: React.KeyboardEvent<any>): 'up' | 'down' | null {
    switch (event.key) {
      case 'ArrowUp': return 'up'
      case 'ArrowDown': return 'down'
    }

    return null
  }

  private onKeyDown = (event: React.KeyboardEvent<ElementType>) => {

    if (this.props.onKeyDown) {
      this.props.onKeyDown(event)
    }

    if (event.defaultPrevented) {
      return
    }

    const currentAutoCompletionState = this.state.autocompletionState

    if (!currentAutoCompletionState) {
      return
    }

    const selectedRow = currentAutoCompletionState.selectedItem
      ? currentAutoCompletionState.items.indexOf(currentAutoCompletionState.selectedItem)
      : -1

    const direction = this.getMovementDirection(event)
    if (direction) {
      event.preventDefault()

      const nextRow = this.autocompletionList!.nextSelectableRow(direction, selectedRow)
      const newSelectedItem = currentAutoCompletionState.items[nextRow]

      const newAutoCompletionState = {
        ...currentAutoCompletionState,
        selectedItem: newSelectedItem,
      }

      this.setState({ autocompletionState: newAutoCompletionState })
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      const item = currentAutoCompletionState.selectedItem
      if (item) {
        event.preventDefault()

        this.insertCompletion(item)
      }
    } else if (event.key === 'Escape') {
      this.setState({ autocompletionState: null })
    }
  }

  private async attemptAutocompletion(str: string, caretPosition: number): Promise<IAutocompletionState<any> | null> {
    for (const provider of this.props.autocompletionProviders) {
      // NB: RegExps are stateful (AAAAAAAAAAAAAAAAAA) so defensively copy the
      // regex we're given.
      const regex = new RegExp(provider.getRegExp())
      if (!regex.global) {
        fatalError(`The regex (${regex}) returned from ${provider} isn't global, but it should be!`)
        continue
      }

      let result: RegExpExecArray | null = null
      while (result = regex.exec(str)) {
        const index = regex.lastIndex
        const text = result[1] || ''
        if (index === caretPosition) {
          const range = { start: index - text.length, length: text.length }
          const items = await provider.getAutocompletionItems(text)

          const selectedItem = items[0]
          return { provider, items, range, selectedItem, rangeText: text }
        }
      }
    }

    return null
  }

  private onChange = async (event: React.FormEvent<ElementType>) => {

    const str = event.currentTarget.value

    if (this.props.onValueChanged) {
      this.props.onValueChanged(str)
    }

    const caretPosition = this.element!.selectionStart
    const requestID = ++this.autocompletionRequestID
    const autocompletionState = await this.attemptAutocompletion(str, caretPosition)

    // If another autocompletion request is in flight, then ignore these
    // results.
    if (requestID !== this.autocompletionRequestID) { return }

    this.setState({ autocompletionState })
  }
}
