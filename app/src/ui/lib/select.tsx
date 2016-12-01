import * as React from 'react'

interface ISelectProps {
  readonly label?: string
  readonly onChange?: (event: React.FormEvent<HTMLSelectElement>) => void
  readonly value?: string
  readonly defaultValue?: string
  readonly children?: ReadonlyArray<JSX.Element>
}

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
