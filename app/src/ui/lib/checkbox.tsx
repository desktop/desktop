import * as React from 'react'

/** The possible values for a Checkbox component. */
export enum CheckboxValue {
  On,
  Off,
  Mixed,
}

interface ICheckboxProps {
  /** The current value of the component. */
  readonly value?: CheckboxValue

  /** The function to call on value change. */
  readonly onChange?: (event: React.FormEvent<HTMLInputElement>) => void

  /** The tab index of the input element. */
  readonly tabIndex?: number

  readonly label?: string
}

/** A checkbox component which supports the mixed value. */
export class Checkbox extends React.Component<ICheckboxProps, void> {

  private input: HTMLInputElement | null

  private onChange = (event: React.FormEvent<HTMLInputElement>) => {
    if (this.props.onChange) {
      this.props.onChange(event)
    }
  }

  public componentDidUpdate() {
    this.updateInputState()
  }

  private updateInputState() {
    const input = this.input
    if (input) {
      const value = this.props.value
      input.indeterminate = value === CheckboxValue.Mixed
      input.checked = value !== CheckboxValue.Off
    }
  }

  private onInputRef = (input: HTMLInputElement) => {
    this.input = input
    // Necessary since componentDidUpdate doesn't run on initial
    // render
    this.updateInputState()
  }

  public render() {
    return (
      <label className='checkbox-component'>
        <input
          tabIndex={this.props.tabIndex}
          type='checkbox'
          onChange={this.onChange}
          ref={this.onInputRef}
        />

        {this.props.label}
      </label>
    )
  }
}
