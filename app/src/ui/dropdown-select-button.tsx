import React from 'react'
import { Button } from './lib/button'
import { Octicon, OcticonSymbol } from './octicons'

export interface IDropdownSelectButtonOption {
  /** The select option header label. */
  readonly label?: string | JSX.Element

  /** The select option description */
  readonly description?: string | JSX.Element

  /** The select option's value */
  readonly value?: string
}

interface IDropdownSelectButtonProps {
  readonly options: IDropdownSelectButtonOption[]

  /** The selection option value */
  readonly selectedValue?: string

  /** Whether or not the button is enabled */
  readonly disabled?: boolean

  /** Callback for when the button selection changes*/
  readonly onSelectChange?: (
    selectedOption: IDropdownSelectButtonOption
  ) => void
}

interface IDropdownSelectButtonState {
  /** Whether the options are rendered */
  readonly showButtonOptions: boolean

  /** The currently selected option */
  readonly selectedOption: IDropdownSelectButtonOption | null

  /** The  max height of options container - calculated based on the height of
   * the app window so that we don't get clipping and the options scroll if
   * needed */
  readonly optionsMaxHeight?: string
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
    const calcMaxHeight = windowHeight - bottomOfButton - 15
    const scrollHeight = this.optionsContainerRef.scrollHeight
    const optionsMaxHeight =
      calcMaxHeight < scrollHeight
        ? `${windowHeight - bottomOfButton - 15}px`
        : undefined
    if (optionsMaxHeight !== this.state.optionsMaxHeight) {
      this.setState({ optionsMaxHeight })
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
      this.setState({ selectedOption })

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
    const { optionsMaxHeight: maxHeight } = this.state
    return (
      <div
        className="split-button-options"
        style={{
          maxHeight,
          overflowY: maxHeight !== undefined ? 'scroll' : undefined,
        }}
        ref={this.onOptionsContainerRef}
      >
        <ul>
          {options.map(o => (
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

  public render() {
    const { options, disabled } = this.props
    const { selectedOption } = this.state
    if (options.length === 0 || selectedOption === null) {
      return
    }

    // The button is type of submit so that it will trigger a form's onSubmit
    // method.
    return (
      <div className="split-button">
        <Button
          className="invoke-button"
          disabled={disabled}
          type="submit"
          onButtonRef={this.onInvokeButtonRef}
        >
          {selectedOption.label}
        </Button>
        <Button
          disabled={disabled}
          className="dropdown-button"
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
