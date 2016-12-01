import * as React from 'react'

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

/** A select element with app-standard styles. */
export class Select extends React.Component<ISelectProps, void> {
  public render() {
    return (
      <label className='select-component'>
        {this.props.label}

        <select
          onChange={this.props.onChange}
          value={this.props.value}
          defaultValue={this.props.defaultValue}>
          {this.props.children}
        </select>
      </label>
    )
  }
}
