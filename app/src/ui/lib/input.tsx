import * as React from 'react'
import * as classNames from 'classnames'

interface IInputProps {
  readonly label?: string
  readonly labelClassName?: string

  readonly inputClassName?: string

  readonly placeholder?: string
  readonly value?: string
  readonly secure?: boolean

  readonly onChange?: (event: React.FormEvent<HTMLInputElement>) => void
  readonly onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void

  readonly children?: ReadonlyArray<JSX.Element>
}

export class Input extends React.Component<IInputProps, void> {
  public render() {
    const className = classNames('input-component', this.props.labelClassName)
    return (
      <label className={className}>
        {this.props.label}

        <div className='input-content'>
          <input
            className={this.props.inputClassName}
            type={!this.props.secure ? 'text' : 'password'}
            placeholder={this.props.placeholder}
            value={this.props.value}
            onChange={this.props.onChange}
            onKeyDown={this.props.onKeyDown}/>

          {this.props.children}
        </div>
      </label>
    )
  }
}
