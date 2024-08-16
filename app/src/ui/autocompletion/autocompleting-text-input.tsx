import * as React from 'react'
import {
  List,
  SelectionSource,
  findNextSelectableRow,
  SelectionDirection,
} from '../lib/list'
import { IAutocompletionProvider } from './index'
import { fatalError } from '../../lib/fatal-error'
import classNames from 'classnames'
import getCaretCoordinates from 'textarea-caret'
import { showContextualMenu } from '../../lib/menu-item'
import { AriaLiveContainer } from '../accessibility/aria-live-container'
import { createUniqueId, releaseUniqueId } from '../lib/id-pool'
import {
  Popover,
  PopoverAnchorPosition,
  PopoverDecoration,
} from '../lib/popover'

interface IRange {
  readonly start: number
  readonly length: number
}

interface IAutocompletingTextInputProps<ElementType, AutocompleteItemType> {
  /** An optional specified id for the input */
  readonly inputId?: string

  /**
   * An optional className to be applied to the rendered
   * top level element of the component.
   */
  readonly className?: string

  /** Element ID for the input field. */
  readonly elementId?: string

  /** Content of an optional invisible label element for screen readers. */
  readonly screenReaderLabel?: string

  /**
   * The label of the text box.
   */
  readonly label?: string | JSX.Element

  /** The placeholder for the input field. */
  readonly placeholder?: string

  /** The current value of the input field. */
  readonly value?: string

  /** Whether or not the input should be read-only and styled as disabled */
  readonly readOnly?: boolean

  /** Indicates if input field should be required */
  readonly required?: boolean

  /** Indicates if input field applies spellcheck */
  readonly spellcheck?: boolean

  /** Indicates if it should always try to autocomplete. Optional (defaults to false) */
  readonly alwaysAutocomplete?: boolean

  /** Filter for autocomplete items */
  readonly autocompleteItemFilter?: (item: AutocompleteItemType) => boolean

  /**
   * Called when the user changes the value in the input field.
   */
  readonly onValueChanged?: (value: string) => void

  /** Called on key down. */
  readonly onKeyDown?: (event: React.KeyboardEvent<ElementType>) => void

  /** Called when an autocomplete item has been selected. */
  readonly onAutocompleteItemSelected?: (value: AutocompleteItemType) => void

  /**
   * A list of autocompletion providers that should be enabled for this
   * input.
   */
  readonly autocompletionProviders: ReadonlyArray<IAutocompletionProvider<any>>

  /**
   * A method that's called when the internal input or textarea element
   * is mounted or unmounted.
   */
  readonly onElementRef?: (elem: ElementType | null) => void

  /**
   * Optional callback to override the default edit context menu
   * in the input field.
   */
  readonly onContextMenu?: (event: React.MouseEvent<any>) => void

  /** Called when the input field receives focus. */
  readonly onFocus?: (event: React.FocusEvent<ElementType>) => void
}

interface IAutocompletionState<T> {
  readonly provider: IAutocompletionProvider<T>
  readonly items: ReadonlyArray<T>
  readonly range: IRange
  readonly rangeText: string
  readonly selectedItem: T | null
  readonly selectedRowId: string | undefined
  readonly itemListRowIdPrefix: string
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

  /** Coordinates of the caret in the input/textarea element */
  readonly caretCoordinates: ReturnType<typeof getCaretCoordinates> | null

  /**
   * An automatically generated id for the text element used to reference
   * it from the label element. This is generated once via the id pool when the
   * component is mounted and then released once the component unmounts.
   */
  readonly uniqueInternalElementId?: string

  /**
   * An automatically generated id for the autocomplete container element used
   * to reference it from the ARIA autocomplete-related attributes. This is
   * generated once via the id pool when the component is mounted and then
   * released once the component unmounts.
   */
  readonly autocompleteContainerId?: string
}

/** A text area which provides autocompletions as the user types. */
export abstract class AutocompletingTextInput<
  ElementType extends HTMLInputElement | HTMLTextAreaElement,
  AutocompleteItemType extends object
> extends React.Component<
  IAutocompletingTextInputProps<ElementType, AutocompleteItemType>,
  IAutocompletingTextInputState<AutocompleteItemType>
> {
  private element: ElementType | null = null
  private invisibleCaretRef = React.createRef<HTMLDivElement>()

  /** The identifier for each autocompletion request. */
  private autocompletionRequestID = 0

  /**
   * To be implemented by subclasses. It must return the element tag name which
   * should correspond to the ElementType over which it is parameterized.
   */
  protected abstract getElementTagName(): 'textarea' | 'input'

  public constructor(
    props: IAutocompletingTextInputProps<ElementType, AutocompleteItemType>
  ) {
    super(props)

    this.state = {
      autocompletionState: null,
      caretCoordinates: null,
    }
  }

  public componentWillMount() {
    const elementId =
      this.props.inputId ?? createUniqueId('autocompleting-text-input')
    const autocompleteContainerId = createUniqueId('autocomplete-container')

    this.setState({
      uniqueInternalElementId: elementId,
      autocompleteContainerId,
    })
  }

  public componentWillUnmount() {
    if (this.state.uniqueInternalElementId) {
      releaseUniqueId(this.state.uniqueInternalElementId)
    }

    if (this.state.autocompleteContainerId) {
      releaseUniqueId(this.state.autocompleteContainerId)
    }
  }

  public componentDidUpdate(
    prevProps: IAutocompletingTextInputProps<ElementType, AutocompleteItemType>
  ) {
    if (
      this.props.autocompleteItemFilter !== prevProps.autocompleteItemFilter &&
      this.state.autocompletionState !== null
    ) {
      this.open(this.element?.value ?? '')
    }
  }

  private get elementId() {
    return this.props.elementId ?? this.state.uniqueInternalElementId
  }

  private getItemAriaLabel = (row: number): string | undefined => {
    const state = this.state.autocompletionState
    if (!state) {
      return undefined
    }

    const item = state.items[row]
    return state.provider.getItemAriaLabel?.(item)
  }

  private renderItem = (row: number): JSX.Element | null => {
    const state = this.state.autocompletionState
    if (!state) {
      return null
    }

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
    if (!state) {
      return null
    }

    const items = state.items
    if (!items.length) {
      return null
    }

    const selectedRows = state.selectedItem
      ? [items.indexOf(state.selectedItem)]
      : []

    // The height needed to accommodate all the matched items without overflowing
    //
    // Magic number warning! The autocompletion-popup container adds a border
    // which we have to account for in case we want to show N number of items
    // without overflowing and triggering the scrollbar.
    const noOverflowItemHeight = RowHeight * items.length

    const minHeight = RowHeight * Math.min(items.length, 3)

    // Use the completion text as invalidation props so that highlighting
    // will update as you type even though the number of items matched
    // remains the same. Additionally we need to be aware that different
    // providers can use different sorting behaviors which also might affect
    // rendering.
    const searchText = state.rangeText

    const className = classNames('autocompletion-popup', state.provider.kind)

    return (
      <Popover
        anchor={this.invisibleCaretRef.current}
        anchorPosition={PopoverAnchorPosition.BottomLeft}
        decoration={PopoverDecoration.None}
        maxHeight={Math.min(DefaultPopupHeight, noOverflowItemHeight)}
        minHeight={minHeight}
        trapFocus={false}
        className={className}
        isDialog={false}
      >
        <List
          accessibleListId={this.state.autocompleteContainerId}
          ref={this.onAutocompletionListRef}
          rowCount={items.length}
          rowHeight={RowHeight}
          rowId={this.getRowId}
          selectedRows={selectedRows}
          rowRenderer={this.renderItem}
          getRowAriaLabel={this.getItemAriaLabel}
          scrollToRow={selectedRows.at(0)}
          onRowMouseDown={this.onRowMouseDown}
          onRowClick={this.insertCompletionOnClick}
          onSelectedRowChanged={this.onSelectedRowChanged}
          invalidationProps={searchText}
        />
      </Popover>
    )
  }

  private getRowId: (row: number) => string = row => {
    const state = this.state.autocompletionState
    if (!state) {
      return ''
    }

    return `autocomplete-item-row-${state.itemListRowIdPrefix}-${row}`
  }

  private onAutocompletionListRef = (ref: List | null) => {
    const { autocompletionState } = this.state
    if (ref && autocompletionState && autocompletionState.selectedItem) {
      const { items, selectedItem } = autocompletionState
      this.setState({
        autocompletionState: {
          ...autocompletionState,
          selectedRowId: this.getRowId(items.indexOf(selectedItem)),
        },
      })
    }
  }

  private onRowMouseDown = (row: number, event: React.MouseEvent<any>) => {
    const currentAutoCompletionState = this.state.autocompletionState

    if (!currentAutoCompletionState) {
      return
    }

    const item = currentAutoCompletionState.items[row]

    if (item) {
      this.insertCompletion(item, 'mouseclick')
    }
  }

  private onSelectedRowChanged = (row: number, source: SelectionSource) => {
    const currentAutoCompletionState = this.state.autocompletionState

    if (!currentAutoCompletionState) {
      return
    }

    const newSelectedItem = currentAutoCompletionState.items[row]

    const newAutoCompletionState = {
      ...currentAutoCompletionState,
      selectedItem: newSelectedItem,
      selectedRowId: newSelectedItem === null ? undefined : this.getRowId(row),
    }

    this.setState({ autocompletionState: newAutoCompletionState })
  }

  private insertCompletionOnClick = (row: number): void => {
    const state = this.state.autocompletionState
    if (!state) {
      return
    }

    const items = state.items
    if (!items.length) {
      return
    }

    const item = items[row]

    this.insertCompletion(item, 'mouseclick')
  }

  private onContextMenu = (event: React.MouseEvent<any>) => {
    if (this.props.onContextMenu) {
      this.props.onContextMenu(event)
    } else {
      event.preventDefault()
      showContextualMenu([{ role: 'editMenu' }])
    }
  }

  private getActiveAutocompleteItemId(): string | undefined {
    const { autocompletionState } = this.state

    if (autocompletionState === null) {
      return undefined
    }

    if (autocompletionState.selectedRowId) {
      return autocompletionState.selectedRowId
    }

    if (autocompletionState.selectedItem === null) {
      return undefined
    }

    const index = autocompletionState.items.indexOf(
      autocompletionState.selectedItem
    )

    return this.getRowId(index)
  }

  private renderTextInput() {
    const { autocompletionState } = this.state

    const autocompleteVisible =
      autocompletionState !== null && autocompletionState.items.length > 0

    const props = {
      type: 'text',
      id: this.elementId,
      role: 'combobox',
      placeholder: this.props.placeholder,
      value: this.props.value,
      ref: this.onRef,
      onChange: this.onChange,
      onScroll: this.onScroll,
      onKeyDown: this.onKeyDown,
      onFocus: this.onFocus,
      onBlur: this.onBlur,
      onContextMenu: this.onContextMenu,
      readOnly: this.props.readOnly,
      required: this.props.required ? true : false,
      spellCheck: this.props.spellcheck,
      autoComplete: 'off',
      'aria-expanded': autocompleteVisible,
      'aria-autocomplete': 'list' as const,
      'aria-haspopup': 'listbox' as const,
      'aria-controls': this.state.autocompleteContainerId,
      'aria-owns': this.state.autocompleteContainerId,
      'aria-activedescendant': this.getActiveAutocompleteItemId(),
    }

    return React.createElement<React.HTMLAttributes<ElementType>, ElementType>(
      this.getElementTagName(),
      props
    )
  }

  // This will update the caret coordinates in the componen state, so that the
  // "invisible caret" can be positioned correctly.
  // Given the outcome of this function depends on both the caret coordinates
  // and the scroll position, it should be called whenever the caret moves (on
  // text changes) or the scroll position changes.
  private updateCaretCoordinates = () => {
    const element = this.element
    if (!element) {
      this.setState({ caretCoordinates: null })
      return
    }

    const selectionEnd = element.selectionEnd
    if (selectionEnd === null) {
      this.setState({ caretCoordinates: null })
      return
    }

    const caretCoordinates = getCaretCoordinates(element, selectionEnd)

    this.setState({
      caretCoordinates: {
        top: caretCoordinates.top - element.scrollTop,
        left: caretCoordinates.left - element.scrollLeft,
        height: caretCoordinates.height,
      },
    })
  }

  private renderInvisibleCaret = () => {
    const { caretCoordinates } = this.state
    if (!caretCoordinates) {
      return null
    }

    return (
      <div
        style={{
          backgroundColor: 'transparent',
          width: 2,
          height: YOffset,
          position: 'absolute',
          left: caretCoordinates.left,
          top: caretCoordinates.top,
        }}
        ref={this.invisibleCaretRef}
      >
        &nbsp;
      </div>
    )
  }

  private onBlur = (e: React.FocusEvent<ElementType>) => {
    this.close()
  }

  private onFocus = (e: React.FocusEvent<ElementType>) => {
    if (!this.props.alwaysAutocomplete || this.element === null) {
      return
    }

    this.open(this.element.value)

    this.props.onFocus?.(e)
  }

  private onRef = (ref: ElementType | null) => {
    this.element = ref
    this.updateCaretCoordinates()
    if (this.props.onElementRef) {
      this.props.onElementRef(ref)
    }
  }

  public focus() {
    if (this.element) {
      this.element.focus()
    }
  }

  public render() {
    const tagName = this.getElementTagName()
    const className = classNames(
      'autocompletion-container',
      'no-invalid-state',
      this.props.className,
      {
        'text-box-component': tagName === 'input',
        'text-area-component': tagName === 'textarea',
      }
    )
    const { label, screenReaderLabel } = this.props

    const autoCompleteItems = this.state.autocompletionState?.items ?? []

    const suggestionsMessage =
      autoCompleteItems.length === 1
        ? '1 suggestion'
        : `${autoCompleteItems.length} suggestions`

    return (
      <div className={className}>
        {this.renderAutocompletions()}
        {screenReaderLabel && label === undefined && (
          <label className="sr-only" htmlFor={this.elementId}>
            {screenReaderLabel}
          </label>
        )}
        {label && <label htmlFor={this.elementId}>{label}</label>}
        {this.renderTextInput()}
        {this.renderInvisibleCaret()}
        <AriaLiveContainer
          message={autoCompleteItems.length > 0 ? suggestionsMessage : null}
          trackedUserInput={this.state.autocompletionState?.rangeText}
        />
      </div>
    )
  }

  private setCursorPosition(newCaretPosition: number) {
    if (this.element == null) {
      log.warn('Unable to set cursor position when element is null')
      return
    }

    this.element.selectionStart = newCaretPosition
    this.element.selectionEnd = newCaretPosition
  }

  private insertCompletion(
    item: AutocompleteItemType,
    source: 'mouseclick' | 'keyboard'
  ) {
    const element = this.element!
    const autocompletionState = this.state.autocompletionState!
    const originalText = element.value
    const range = autocompletionState.range
    const autoCompleteText =
      autocompletionState.provider.getCompletionText(item)

    const textWithAutoCompleteText =
      originalText.substr(0, range.start - 1) + autoCompleteText + ' '

    const newText =
      textWithAutoCompleteText +
      originalText.substring(range.start + range.length)

    element.value = newText

    if (this.props.onValueChanged) {
      this.props.onValueChanged(newText)
    }

    const newCaretPosition = textWithAutoCompleteText.length

    if (source === 'mouseclick') {
      // we only need to re-focus on the text input when the autocomplete overlay
      // steals focus due to the user clicking on a selection in the autocomplete list
      window.setTimeout(() => {
        element.focus()
        this.setCursorPosition(newCaretPosition)
      }, 0)
    } else {
      this.setCursorPosition(newCaretPosition)
    }

    this.props.onAutocompleteItemSelected?.(item)

    this.close()
    if (this.props.alwaysAutocomplete) {
      this.open('')
    }
  }

  private getMovementDirection(
    event: React.KeyboardEvent<any>
  ): SelectionDirection | null {
    switch (event.key) {
      case 'ArrowUp':
        return 'up'
      case 'ArrowDown':
        return 'down'
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

    if (
      !currentAutoCompletionState ||
      !currentAutoCompletionState.items.length
    ) {
      return
    }

    const selectedRow = currentAutoCompletionState.selectedItem
      ? currentAutoCompletionState.items.indexOf(
          currentAutoCompletionState.selectedItem
        )
      : -1

    const direction = this.getMovementDirection(event)
    if (direction) {
      event.preventDefault()
      const rowCount = currentAutoCompletionState.items.length

      const nextRow = findNextSelectableRow(rowCount, {
        direction,
        row: selectedRow,
      })

      if (nextRow !== null) {
        const newSelectedItem = currentAutoCompletionState.items[nextRow]

        const newAutoCompletionState = {
          ...currentAutoCompletionState,
          selectedItem: newSelectedItem,
          selectedRowId:
            newSelectedItem === null ? undefined : this.getRowId(nextRow),
        }

        this.setState({ autocompletionState: newAutoCompletionState })
      }
    } else if (
      event.key === 'Enter' ||
      (event.key === 'Tab' && !event.shiftKey)
    ) {
      const item = currentAutoCompletionState.selectedItem
      if (item) {
        event.preventDefault()

        this.insertCompletion(item, 'keyboard')
      }
    } else if (event.key === 'Escape') {
      this.close()
    }
  }

  private close() {
    this.setState({ autocompletionState: null })
  }

  private async attemptAutocompletion(
    str: string,
    caretPosition: number
  ): Promise<IAutocompletionState<AutocompleteItemType> | null> {
    const lowercaseStr = str.toLowerCase()

    for (const provider of this.props.autocompletionProviders) {
      // NB: RegExps are stateful (AAAAAAAAAAAAAAAAAA) so defensively copy the
      // regex we're given.
      const regex = new RegExp(provider.getRegExp())
      if (!regex.global) {
        fatalError(
          `The regex (${regex}) returned from ${provider} isn't global, but it should be!`
        )
      }

      let result: RegExpExecArray | null = null
      while ((result = regex.exec(lowercaseStr))) {
        const index = regex.lastIndex
        const text = result[1] || ''
        if (index === caretPosition || this.props.alwaysAutocomplete) {
          const range = { start: index - text.length, length: text.length }
          let items = await provider.getAutocompletionItems(text)

          if (this.props.autocompleteItemFilter) {
            items = items.filter(this.props.autocompleteItemFilter)
          }

          return {
            provider,
            items,
            range,
            selectedItem: null,
            selectedRowId: undefined,
            rangeText: text,
            itemListRowIdPrefix: this.buildAutocompleteListRowIdPrefix(),
          }
        }
      }
    }

    return null
  }

  private buildAutocompleteListRowIdPrefix() {
    return new Date().getTime().toString()
  }

  private onScroll = () => {
    this.updateCaretCoordinates()
  }

  private onChange = async (event: React.FormEvent<ElementType>) => {
    const str = event.currentTarget.value

    if (this.props.onValueChanged) {
      this.props.onValueChanged(str)
    }

    this.updateCaretCoordinates()

    return this.open(str)
  }

  private async open(str: string) {
    const element = this.element

    if (element === null) {
      return
    }

    const caretPosition = element.selectionStart

    if (caretPosition === null) {
      return
    }

    const requestID = ++this.autocompletionRequestID
    const autocompletionState = await this.attemptAutocompletion(
      str,
      caretPosition
    )

    // If another autocompletion request is in flight, then ignore these
    // results.
    if (requestID !== this.autocompletionRequestID) {
      return
    }

    this.setState({ autocompletionState })
  }
}
