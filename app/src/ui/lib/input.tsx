import * as React from 'react'

interface IInputProps {
  readonly label?: string
  readonly labelClassName?: string

  readonly inputClassName?: string

  readonly placeholder?: string
  readonly value?: string
  readonly onChange?: (event: React.FormEvent<HTMLInputElement>) => void
  readonly secure?: boolean

  readonly children?: ReadonlyArray<JSX.Element>
}

export class Input extends React.Component<IInputProps, void> {
  public render() {
    return (
      <label className={`input-component ${this.props.labelClassName}`}>
        {this.props.label}

        <div className='input-content'>
          <input
            className={this.props.inputClassName}
            type={!this.props.secure ? 'text' : 'password'}
            placeholder={this.props.placeholder}
            value={this.props.value}
            onChange={this.props.onChange}/>

          {this.props.children}
        </div>
      </label>
    )
  }
}
