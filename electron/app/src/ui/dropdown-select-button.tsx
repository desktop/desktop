import classNames from 'classnames'
import React from 'react'
import { Button } from './lib/button'
import { Octicon } from './octicons'
import * as octicons from './octicons/octicons.generated'
import { MenuPane } from './app-menu'
import { ICheckboxMenuItem, MenuItem } from '../models/app-menu'
import { ClickSource, SelectionSource } from './lib/list'

export interface IDropdownSelectButtonOption {
  /** The select option header label. */
  readonly label: string

  /** The select option description */
  readonly description?: string | JSX.Element

  /** The select option's value */
  readonly id: string
}

interface IDropdownSelectButtonProps {
  /** The selection button options */
  readonly options: ReadonlyArray<IDropdownSelectButtonOption>

  /** The selection option value */
  readonly checkedOption?: string

  /** Whether or not the button is enabled */
  readonly disabled?: boolean

  /** tooltip for the button */
  readonly tooltip?: string

  /** aria-describedby for the button */
  readonly ariaDescribedBy?: string

  /** aria-label for the dropdown button */
  readonly dropdownAriaLabel: string

  /** Callback for when the button selection changes*/
  readonly onCheckedOptionChange?: (
    selectedOption: IDropdownSelectButtonOption
  ) => void

  /** Callback for when button is selected option button is clicked */
  readonly onSubmit?: (
    event: React.MouseEvent<HTMLButtonElement>,
    selectedOption: IDropdownSelectButtonOption
  ) => void
}

interface IDropdownSelectButtonState {
  /** Whether the options are rendered */
  readonly showButtonOptions: boolean

  /** The currently checked option (not necessarily highlighted, but is the only option checked) */
  readonly checkedOption: IDropdownSelectButtonOption | null

  /** The currently selected option -> The option highlighted that if clicked or hit enter on would become checked */
  readonly selectedOption: IDropdownSelectButtonOption | null

  /**
   * The adjusting position of the options popover. This is calculated based
   * on if there is enough room to show the options below the dropdown button.
   */
  readonly optionsPositionBottom?: string
}

export class DropdownSelectButton extends React.Component<
  IDropdownSelectButtonProps,
  IDropdownSelectButtonState
> {
  private invokeButtonRef: HTMLButtonElement | null = null
  private dropdownButtonRef: HTMLButtonElement | null = null
  private optionsContainerRef: HTMLDivElement | null = null
  private dropdownSelectContainerRef = React.createRef<HTMLDivElement>()

  public constructor(props: IDropdownSelectButtonProps) {
    super(props)

    this.state = {
      showButtonOptions: false,
      checkedOption: this.getCheckedOption(props.checkedOption),
      selectedOption: this.getCheckedOption(props.checkedOption),
    }
  }

  public componentDidMount(): void {
    if (this.dropdownSelectContainerRef.current) {
      this.dropdownSelectContainerRef.current.addEventListener(
        'focusout',
        this.onFocusOut
      )
    }
  }

  public componentWillUnmount(): void {
    if (this.dropdownSelectContainerRef.current) {
      this.dropdownSelectContainerRef.current.removeEventListener(
        'focusout',
        this.onFocusOut
      )
    }
  }

  private onFocusOut = (event: FocusEvent) => {
    if (
      this.state.showButtonOptions &&
      event.relatedTarget &&
      !this.dropdownSelectContainerRef.current?.contains(
        event.relatedTarget as Node
      )
    ) {
      this.setState({ showButtonOptions: false })
    }
  }

  public componentDidUpdate() {
    if (this.invokeButtonRef === null || this.optionsContainerRef === null) {
      return
    }

    const windowHeight = window.innerHeight
    const bottomOfButton = this.invokeButtonRef.getBoundingClientRect().bottom
    const invokeButtonHeight =
      this.invokeButtonRef.getBoundingClientRect().height
    // 15 pixels is just to give some padding room below it
    const calcMaxHeight = windowHeight - bottomOfButton - 15
    const heightOfOptions = this.optionsContainerRef.clientHeight
    const optionsPositionBottom =
      calcMaxHeight < heightOfOptions ? `${invokeButtonHeight}px` : undefined
    if (optionsPositionBottom !== this.state.optionsPositionBottom) {
      this.setState({ optionsPositionBottom })
    }
  }

  private getCheckedOption(
    selectedValue: string | undefined
  ): IDropdownSelectButtonOption | null {
    const { options } = this.props
    if (options.length === 0) {
      return null
    }

    const selectedOption = options.find(o => o.id === selectedValue)
    return selectedOption ?? options[0]
  }

  private onItemClick = (
    depth: number,
    item: MenuItem,
    source: ClickSource
  ) => {
    const selectedOption = this.props.options.find(o => o.id === item.id)

    if (!selectedOption) {
      return
    }

    this.setState({ checkedOption: selectedOption, showButtonOptions: false })
    this.dropdownButtonRef?.focus()
    this.props.onCheckedOptionChange?.(selectedOption)
  }

  private onClearSelection = () => {
    this.setState({ selectedOption: null })
  }

  private onPaneKeyDown = (
    depth: number | undefined,
    event: React.KeyboardEvent<HTMLDivElement>
  ) => {
    if (event.key !== 'Escape' && event.key !== 'Esc') {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    this.dropdownButtonRef?.focus()
    this.setState({ showButtonOptions: false })
  }

  private onSelectionChanged = (
    depth: number,
    item: MenuItem,
    source: SelectionSource
  ) => {
    const selectedOption = this.props.options.find(o => o.id === item.id)

    if (!selectedOption) {
      return
    }

    this.setState({ selectedOption })
  }

  private openSplitButtonDropdown = () => {
    this.setState({ showButtonOptions: !this.state.showButtonOptions })
  }

  private onDropdownButtonKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>
  ) => {
    const { key } = event
    let flag = false

    switch (key) {
      case ' ':
      case 'Enter':
      case 'ArrowDown':
      case 'Down':
        this.setState({
          selectedOption: this.props.options.at(0) ?? null,
          showButtonOptions: true,
        })
        flag = true
        break

      case 'Esc':
      case 'Escape':
        this.dropdownButtonRef?.focus()
        this.setState({ showButtonOptions: false })
        flag = true
        break

      case 'Up':
      case 'ArrowUp':
        this.setState({
          selectedOption: this.props.options.at(-1) ?? null,
          showButtonOptions: true,
        })
        flag = true
        break

      default:
        break
    }

    if (flag) {
      event.stopPropagation()
      event.preventDefault()
    }
  }

  private onInvokeButtonRef = (buttonRef: HTMLButtonElement | null) => {
    this.invokeButtonRef = buttonRef
  }

  private onDropdownButtonRef = (buttonRef: HTMLButtonElement | null) => {
    this.dropdownButtonRef = buttonRef
  }

  private onOptionsContainerRef = (ref: HTMLDivElement | null) => {
    this.optionsContainerRef = ref
  }

  private renderOption = (item: MenuItem) => {
    const option = this.props.options.find(o => o.id === item.id)
    if (!option) {
      return
    }

    return (
      <>
        <div className="option-title">{option.label}</div>
        <div className="option-description">{option.description}</div>
      </>
    )
  }

  private getMenuItems(
    options: ReadonlyArray<IDropdownSelectButtonOption>,
    checkedOptionId: string | undefined
  ): ReadonlyArray<MenuItem> {
    const defaultCheckBoxMenuItem: ICheckboxMenuItem = {
      type: 'checkbox',
      id: '',
      label: '',
      checked: false,
      enabled: true,
      visible: true,
      accelerator: null,
      accessKey: null,
    }

    return options.map(({ id, label }) => {
      const checked = checkedOptionId === id
      return { ...defaultCheckBoxMenuItem, ...{ id, label, checked } }
    })
  }

  private renderSplitButtonOptions() {
    const {
      showButtonOptions,
      checkedOption,
      selectedOption,
      optionsPositionBottom: bottom,
    } = this.state

    if (!showButtonOptions) {
      return
    }

    const { options } = this.props

    const items = this.getMenuItems(options, checkedOption?.id)
    const selectedItem = items.find(i => i.id === selectedOption?.id)
    const openClass = bottom !== undefined ? 'open-top' : 'open-bottom'
    const classes = classNames('dropdown-select-button-options', openClass)

    return (
      <div
        className={classes}
        style={{ bottom }}
        ref={this.onOptionsContainerRef}
      >
        <MenuPane
          depth={0}
          items={items}
          selectedItem={selectedItem}
          onItemClicked={this.onItemClick}
          onKeyDown={this.onPaneKeyDown}
          onSelectionChanged={this.onSelectionChanged}
          onClearSelection={this.onClearSelection}
          allowFirstCharacterNavigation={true}
          renderLabel={this.renderOption}
        />
      </div>
    )
  }

  private onSubmit = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (
      this.props.onSubmit !== undefined &&
      this.state.checkedOption !== null
    ) {
      this.props.onSubmit(event, this.state.checkedOption)
    }
  }

  public render() {
    const { options, disabled, dropdownAriaLabel } = this.props
    const {
      checkedOption: selectedOption,
      optionsPositionBottom,
      showButtonOptions,
    } = this.state
    if (options.length === 0 || selectedOption === null) {
      return
    }

    const openClass =
      optionsPositionBottom !== undefined ? 'open-top' : 'open-bottom'
    const containerClasses = classNames(
      'dropdown-select-button',
      showButtonOptions ? openClass : null
    )

    const dropdownClasses = classNames('dropdown-button', { disabled })
    // The button is type of submit so that it will trigger a form's onSubmit
    // method.
    return (
      <div className={containerClasses} ref={this.dropdownSelectContainerRef}>
        <div className="dropdown-button-wrappers">
          <Button
            className="invoke-button"
            disabled={disabled}
            type="submit"
            ariaDescribedBy={this.props.ariaDescribedBy}
            tooltip={this.props.tooltip}
            onButtonRef={this.onInvokeButtonRef}
            onClick={this.onSubmit}
          >
            {selectedOption.label}
          </Button>
          <Button
            className={dropdownClasses}
            onClick={this.openSplitButtonDropdown}
            onKeyDown={this.onDropdownButtonKeyDown}
            onButtonRef={this.onDropdownButtonRef}
            type="button"
            ariaExpanded={showButtonOptions}
            ariaHaspopup={true}
            ariaLabel={dropdownAriaLabel}
          >
            <Octicon symbol={octicons.triangleDown} />
          </Button>
        </div>
        {this.renderSplitButtonOptions()}
      </div>
    )
  }
}
