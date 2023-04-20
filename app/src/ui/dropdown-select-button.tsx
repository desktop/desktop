import classNames from 'classnames'
import React from 'react'
import { Button } from './lib/button'
import { Octicon } from './octicons'
import * as OcticonSymbol from './octicons/octicons.generated'

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
  readonly selectedValue?: T

  /** Whether or not the button is enabled */
  readonly disabled?: boolean

  /** tooltip for the button */
  readonly tooltip?: string

  /** Callback for when the button selection changes*/
  readonly onSelectChange?: (
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

  /** The currently selected option */
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
      selectedOption: this.getSelectedOption(props.selectedValue),
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

  public componentDidMount() {
    window.addEventListener('keydown', this.onKeyDown)
  }

  public componentWillUnmount() {
    window.removeEventListener('keydown', this.onKeyDown)
  }

  private onKeyDown = (event: KeyboardEvent) => {
    const { key } = event
    if (this.state.showButtonOptions && key === 'Escape') {
      this.setState({ showButtonOptions: false })
      return
    }

    if (
      !this.state.showButtonOptions ||
      !['ArrowUp', 'ArrowDown'].includes(key)
    ) {
      return
    }

    const buttons = this.optionsContainerRef?.querySelectorAll(
      '.dropdown-select-button-options .button-component'
    )

    if (buttons === undefined) {
      return
    }

    const foundCurrentIndex = [...buttons].findIndex(b =>
      b.className.includes('focus')
    )

    let focusedOptionIndex = -1
    if (foundCurrentIndex !== -1) {
      if (key === 'ArrowUp') {
        focusedOptionIndex =
          foundCurrentIndex !== 0
            ? foundCurrentIndex - 1
            : this.props.options.length - 1
      } else {
        focusedOptionIndex =
          foundCurrentIndex !== this.props.options.length - 1
            ? foundCurrentIndex + 1
            : 0
      }
    } else {
      focusedOptionIndex = key === 'ArrowUp' ? this.props.options.length - 1 : 0
    }

    const button = buttons?.item(focusedOptionIndex) as HTMLButtonElement
    button?.focus()
  }

  private getSelectedOption(
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

  private onSelectionChange = (
    selectedOption: IDropdownSelectButtonOption<T>
  ) => {
    return (_event?: React.MouseEvent<HTMLElement, MouseEvent>) => {
      this.setState({ selectedOption, showButtonOptions: false })

      const { onSelectChange } = this.props
      if (onSelectChange !== undefined) {
        onSelectChange(selectedOption)
      }
    }
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

  private renderSelectedIcon(option: IDropdownSelectButtonOption<T>) {
    const { selectedOption } = this.state
    if (selectedOption === null || option.value !== selectedOption.value) {
      return
    }

    return (
      <Octicon
        className="selected-option-indicator"
        symbol={OcticonSymbol.check}
      />
    )
  }

  private renderOption = (o: IDropdownSelectButtonOption<T>) => {
    return (
      <Button key={o.value} onClick={this.onSelectionChange(o)}>
        {this.renderSelectedIcon(o)}
        <div className="option-title">{o.label}</div>
        <div className="option-description">{o.description}</div>
      </Button>
    )
  }

  private renderSplitButtonOptions() {
    if (!this.state.showButtonOptions) {
      return
    }

    const { options } = this.props
    const { optionsPositionBottom: bottom } = this.state
    const openClass = bottom !== undefined ? 'open-top' : 'open-bottom'
    const classes = classNames('dropdown-select-button-options', openClass)

    return (
      <div
        className={classes}
        style={{ bottom }}
        ref={this.onOptionsContainerRef}
      >
        {options.map(o => this.renderOption(o))}
      </div>
    )
  }

  private onSubmit = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (
      this.props.onSubmit !== undefined &&
      this.state.selectedOption !== null
    ) {
      this.props.onSubmit(event, this.state.selectedOption)
    }
  }

  public render() {
    const { options, disabled } = this.props
    const { selectedOption, optionsPositionBottom, showButtonOptions } =
      this.state
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
          >
            <Octicon symbol={OcticonSymbol.triangleDown} />
          </Button>
        </div>
        {this.renderSplitButtonOptions()}
      </div>
    )
  }
}
