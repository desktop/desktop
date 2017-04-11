import * as React from 'react'
import { createUniqueId, releaseUniqueId } from './id-pool'

interface ISelectProps {
  /** The label for the select control. */
  readonly label?: string

  /** The value of the select control. */
  readonly value?: string

  /** The default value of the select control. */
  readonly defaultValue?: string

  /** Called when the user changes the selected valued. */
  readonly onChange?: (event: React.FormEvent<HTMLSelectElement>) => void

  /** The <option>'s for the select control. */
  readonly children?: ReadonlyArray<JSX.Element>
}

interface ISelectState {
  /**
   * An automatically generated id for the input element used to reference
   * it from the label element. This is generated once via the id pool when the
   * component is mounted and then released once the component unmounts.
   */
  readonly inputId?: string
}

/** A select element with app-standard styles. */
export class Select extends React.Component<ISelectProps, ISelectState> {

  public componentWillMount() {
    const friendlyName = this.props.label || 'unknown'
    const inputId = createUniqueId(`TextBox_${friendlyName}`)

    this.setState({ inputId })
  }

  public componentWillUnmount() {
    if (this.state.inputId) {
      releaseUniqueId(this.state.inputId)
    }
  }

  public render() {
    return (
      <div className='select-component'>
        <label htmlFor={this.state.inputId}>{this.props.label}</label>
        <select
          onChange={this.props.onChange}
          value={this.props.value}
          defaultValue={this.props.defaultValue}>
          {this.props.children}
        </select>
      </div>
    )
  }
}
