import * as React from 'react'
import { RadioButton } from './radio-button'

interface IRadioGroupProps<T> {
  /** The id of the element that serves as the menu's accessibility label */
  readonly ariaLabelledBy?: string

  /**
   * The currently selected item, denoted by its key.
   */
  readonly selectedKey: T

  /**
   * The keys of the radio buttons to display, in order of the radio buttons.
   */
  readonly radioButtonKeys: ReadonlyArray<T>

  /** Optional class for radio group*/
  readonly className?: string

  /**
   * A function that's called whenever the selected item changes, either
   * as a result of a click using a pointer device or as a result of the user
   * hitting an up/down while the component has focus.
   *
   * The key argument corresponds to the key property of the selected item.
   */
  readonly onSelectionChanged: (key: T) => void
}

/**
 * A component for presenting a small number of choices to the user.
 */
export class RadioGroup<T extends string> extends React.Component<
  IRadioGroupProps<T>
> {
  private onSelectionChanged = (key: T) => {
    this.props.onSelectionChanged(key)
  }

  private renderRadioButtons() {
    const { children, radioButtonKeys, selectedKey } = this.props
    const childrenArr = React.Children.toArray(children)

    return childrenArr.map((child, index) => {
      const key = radioButtonKeys[index]
      const checked = selectedKey === key
      return (
        <RadioButton<T>
          key={key}
          checked={checked}
          value={key}
          onSelected={this.onSelectionChanged}
          tabIndex={checked ? 0 : -1}
        >
          {child}
        </RadioButton>
      )
    })
  }

  public render() {
    return (
      <div
        role="radiogroup"
        aria-labelledby={this.props.ariaLabelledBy}
        className={this.props.className}
      >
        {this.renderRadioButtons()}
      </div>
    )
  }
}
