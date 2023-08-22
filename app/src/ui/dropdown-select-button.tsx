import classNames from 'classnames'
import React from 'react'
import { Button } from './lib/button'
import { Octicon } from './octicons'
import * as OcticonSymbol from './octicons/octicons.generated'
import { MenuPane } from './app-menu'
import { MenuItem } from '../models/app-menu'
import { ClickSource, SelectionSource } from './lib/list'

export interface IDropdownSelectButtonOption<T extends string> {
  /** The select option header label. */
  readonly label?: string | JSX.Element

  /** The select option description */
  readonly description?: string | JSX.Element

  /** The select option's value */
  readonly value: T
}

interface IDropdownSelectButtonProps<T extends string> {
  /** The selection button options */
  readonly options: ReadonlyArray<IDropdownSelectButtonOption<T>>

  /** The selection option value */
  readonly checkedOption?: T

  /** Whether or not the button is enabled */
  readonly disabled?: boolean

  /** tooltip for the button */
  readonly tooltip?: string

   /** aria label for the button */
   readonly dropdownAriaLabel: string

  /** Callback for when the button selection changes*/
  readonly onCheckedOptionChange?: (
    selectedOption: IDropdownSelectButtonOption<T>
  ) => void

  /** Callback for when button is selected option button is clicked */
  readonly onSubmit?: (
    event: React.MouseEvent<HTMLButtonElement>,
    selectedOption: IDropdownSelectButtonOption<T>
  ) => void
}

interface IDropdownSelectButtonState<T extends string> {
  /** Whether the options are rendered */
  readonly showButtonOptions: boolean

  /** The currently checked option (not necessarily highlighted, but is the only option checked) */
  readonly checkedOption: IDropdownSelectButtonOption<T> | null

  /** The currently selected option -> The option highlighted that if clicked or hit enter on would become checked */
  readonly selectedOption: IDropdownSelectButtonOption<T> | null

  /**
   * The adjusting position of the options popover. This is calculated based
   * on if there is enough room to show the options below the dropdown button.
   */
  readonly optionsPositionBottom?: string
}

export class DropdownSelectButton<
  T extends string = string
> extends React.Component<
  IDropdownSelectButtonProps<T>,
  IDropdownSelectButtonState<T>
> {
  private invokeButtonRef: HTMLButtonElement | null = null
  private optionsContainerRef: HTMLDivElement | null = null

  public constructor(props: IDropdownSelectButtonProps<T>) {
    super(props)

    this.state = {
      showButtonOptions: false,
      checkedOption: this.getCheckedOption(props.checkedOption),
      selectedOption: this.getCheckedOption(props.checkedOption),
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
    selectedValue: T | undefined
  ): IDropdownSelectButtonOption<T> | null {
    const { options } = this.props
    if (options.length === 0) {
      return null
    }

    const selectedOption = options.find(o => o.value === selectedValue)
    if (selectedOption === undefined) {
      return options[0]
    }
    return selectedOption
  }

  private onItemClick = (
    depth: number | undefined,
    item: MenuItem,
    source: ClickSource
  ) => {
    const selectedOption = this.props.options.find(o => o.value === item.id)

    if (!selectedOption) {
      return
    }

    this.setState({ checkedOption: selectedOption, showButtonOptions: false })

    this.props.onCheckedOptionChange?.(selectedOption)
  }

  private onClearSelection = () => {
    this.setState({ selectedOption: null })
  }

  private onPaneKeyDown = (
    depth: number | undefined,
    event: React.KeyboardEvent<HTMLDivElement>
  ) => {
    if (event.key !== 'Escape') {
      return
    }

    event.preventDefault()
    this.setState({ showButtonOptions: false })
  }

  private onSelectionChanged = (
    depth: number = 0,
    item: MenuItem,
    source: SelectionSource
  ) => {
    const selectedOption = this.props.options.find(o => o.value === item.id)

    if (!selectedOption) {
      return
    }

    this.setState({ selectedOption })
  }

  private openSplitButtonDropdown = () => {
    this.setState({ showButtonOptions: !this.state.showButtonOptions })
  }

  private onInvokeButtonRef = (buttonRef: HTMLButtonElement | null) => {
    this.invokeButtonRef = buttonRef
  }

  private onOptionsContainerRef = (ref: HTMLDivElement | null) => {
    this.optionsContainerRef = ref
  }

  private renderOption = (o: IDropdownSelectButtonOption<T>) => {
    return (
      <>
        <div className="option-title">{o.label}</div>
        <div className="option-description">{o.description}</div>
      </>
    )
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

    const items: ReadonlyArray<MenuItem> = options.map(o => ({
      type: 'checkbox',
      id: o.value,
      enabled: true,
      visible: true,
      label: this.renderOption(o),
      accelerator: null,
      accessKey: null,
      checked: checkedOption?.value === o.value,
    }))

    const selectedItem = items.find(i => i.id === selectedOption?.value)
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
      <div className={containerClasses}>
        <div className="dropdown-button-wrappers">
          <Button
            className="invoke-button"
            disabled={disabled}
            type="submit"
            tooltip={this.props.tooltip}
            onButtonRef={this.onInvokeButtonRef}
            onClick={this.onSubmit}
          >
            {selectedOption.label}
          </Button>
          <Button
            className={dropdownClasses}
            onClick={this.openSplitButtonDropdown}
            type="button"
            ariaExpanded={showButtonOptions}
            ariaHaspopup={true}
            ariaLabel={dropdownAriaLabel}
          >
            <Octicon symbol={OcticonSymbol.triangleDown} />
          </Button>
        </div>
        {this.renderSplitButtonOptions()}
      </div>
    )
  }
}
