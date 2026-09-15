import * as React from 'react'
import { createUniqueId, releaseUniqueId } from './id-pool'

interface IRadioButtonProps<T> {
  /**
   * Called when the user selects this radio button.
   *
   * The function will be called with the value of the RadioButton
   * and the original event that triggered the change.
   */
  readonly onSelected: (
    value: T,
    event: React.FormEvent<HTMLInputElement>
  ) => void

  /**
   * Whether the radio button is selected.
   */
  readonly checked: boolean

  /**
   * The label of the radio button. If not provided, the children are used
   */
  readonly label?: string | JSX.Element

  /**
   * The value of the radio button.
   */
  readonly value: T

  /** Optional: The tab index of the radio button */
  readonly tabIndex?: number

  /** Whether the textarea field should auto focus when mounted. */
  readonly autoFocus?: boolean

  /** Optional: The onDoubleClick event handler for radio button */
  readonly onDoubleClick?: (
    key: T,
    event: React.MouseEvent<HTMLLabelElement>
  ) => void
}

interface IRadioButtonState {
  readonly inputId: string
}

export class RadioButton<T extends React.Key> extends React.Component<
  IRadioButtonProps<T>,
  IRadioButtonState
> {
  public constructor(props: IRadioButtonProps<T>) {
    super(props)

    this.state = {
      inputId: createUniqueId(`RadioButton_${this.props.value}`),
    }
  }

  public componentWillUnmount() {
    releaseUniqueId(this.state.inputId)
  }

  public render() {
    return (
      <div className="radio-button-component">
        <label htmlFor={this.state.inputId} onDoubleClick={this.onDoubleClick}>
          <input
            type="radio"
            id={this.state.inputId}
            value={this.props.value}
            checked={this.props.checked}
            onChange={this.onSelected}
            tabIndex={this.props.tabIndex}
            autoFocus={this.props.autoFocus}
          />
          <span>{this.props.label ?? this.props.children}</span>
        </label>
      </div>
    )
  }

  private onSelected = (evt: React.FormEvent<HTMLInputElement>) => {
    this.props.onSelected(this.props.value, evt)
  }

  private onDoubleClick = (evt: React.MouseEvent<HTMLLabelElement>) => {
    this.props.onDoubleClick?.(this.props.value, evt)
  }
}
