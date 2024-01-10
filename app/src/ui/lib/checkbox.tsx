import * as React from 'react'
import { createUniqueId, releaseUniqueId } from './id-pool'
import uuid from 'uuid'

/** The possible values for a Checkbox component. */
export enum CheckboxValue {
  On,
  Off,
  Mixed,
}

interface ICheckboxProps {
  /** Is the component disabled. */
  readonly disabled?: boolean

  /** The current value of the component. */
  readonly value: CheckboxValue

  /** The function to call on value change. */
  readonly onChange?: (event: React.FormEvent<HTMLInputElement>) => void

  /** The tab index of the input element. */
  readonly tabIndex?: number

  /** The label for the checkbox. */
  readonly label?: string | JSX.Element

  /** An aria description of a checkbox - intended to provide more verbose
   * information than a label that a the user might need */
  readonly ariaDescribedBy?: string
}

interface ICheckboxState {
  /**
   * An automatically generated id for the input element used to reference
   * it from the label element. This is generated once via the id pool when the
   * component is mounted and then released once the component unmounts.
   */
  readonly inputId?: string
}

/** A checkbox component which supports the mixed value. */
export class Checkbox extends React.Component<ICheckboxProps, ICheckboxState> {
  private input: HTMLInputElement | null = null

  private onChange = (event: React.FormEvent<HTMLInputElement>) => {
    if (this.props.onChange) {
      this.props.onChange(event)
    }
  }

  public componentDidUpdate() {
    this.updateInputState()
  }

  public componentWillMount() {
    const friendlyName =
      this.props.label && typeof this.props.label === 'string'
        ? this.props.label
        : uuid()
    const inputId = createUniqueId(`Checkbox_${friendlyName}`)

    this.setState({ inputId })
  }

  public componentWillUnmount() {
    if (this.state.inputId) {
      releaseUniqueId(this.state.inputId)
    }
  }

  public focus() {
    this.input?.focus()
  }

  private updateInputState() {
    const input = this.input
    if (input) {
      const value = this.props.value
      input.indeterminate = value === CheckboxValue.Mixed
      input.checked = value !== CheckboxValue.Off
    }
  }

  private onInputRef = (input: HTMLInputElement | null) => {
    this.input = input
    // Necessary since componentDidUpdate doesn't run on initial
    // render
    this.updateInputState()
  }

  private onDoubleClick = (event: React.MouseEvent<HTMLInputElement>) => {
    // This will prevent double clicks on the checkbox to be bubbled up in the
    // DOM hierarchy and trigger undesired actions. For example, a double click
    // on the checkbox in the changed file list should not open the file in the
    // external editor.
    event.preventDefault()
    event.stopPropagation()
  }

  private renderLabel() {
    const label = this.props.label
    const inputId = this.state.inputId

    return label ? <label htmlFor={inputId}>{label}</label> : null
  }

  public render() {
    return (
      <div className="checkbox-component">
        <input
          id={this.state.inputId}
          tabIndex={this.props.tabIndex}
          type="checkbox"
          onChange={this.onChange}
          onDoubleClick={this.onDoubleClick}
          ref={this.onInputRef}
          disabled={this.props.disabled}
          aria-describedby={this.props.ariaDescribedBy}
        />
        {this.renderLabel()}
      </div>
    )
  }
}
