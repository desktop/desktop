import classNames from 'classnames'
import React from 'react'
import { Button } from './lib/button'
import { Octicon } from './octicons'
import * as OcticonSymbol from './octicons/octicons.generated'

export interface IDropdownSelectButtonOption {
  /** The select option header label. */
  readonly label?: string | JSX.Element

  /** The select option description */
  readonly description?: string | JSX.Element

  /** The select option's value */
  readonly value?: string
}

interface IDropdownSelectButtonProps {
  /** The selection button options */
  readonly options: ReadonlyArray<IDropdownSelectButtonOption>

  /** The selection option value */
  readonly selectedValue?: string

  /** Whether or not the button is enabled */
  readonly disabled?: boolean

  /** tooltip for the button */
  readonly tooltip?: string

  /** Callback for when the button selection changes*/
  readonly onSelectChange?: (
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

  /** The currently selected option */
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
  private optionsContainerRef: HTMLDivElement | null = null

  public constructor(props: IDropdownSelectButtonProps) {
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

  private getSelectedOption(
    selectedValue: string | undefined
  ): IDropdownSelectButtonOption | null {
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

  private onSelectionChange = (selectedOption: IDropdownSelectButtonOption) => {
    return (_event: React.MouseEvent<HTMLLIElement, MouseEvent>) => {
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

  private renderSelectedIcon(option: IDropdownSelectButtonOption) {
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
        <ul>
          {options.map(o => (
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
            <li key={o.value} onClick={this.onSelectionChange(o)}>
              {this.renderSelectedIcon(o)}
              <div className="option-title">{o.label}</div>
              <div className="option-description">{o.description}</div>
            </li>
          ))}
        </ul>
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
        {this.renderSplitButtonOptions()}
      </div>
    )
  }
}
