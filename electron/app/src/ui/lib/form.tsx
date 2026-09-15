import * as React from 'react'
import classNames from 'classnames'

interface IFormProps {
  /** The class name for the form. */
  readonly className?: string

  /** Called when the form is submitted. */
  readonly onSubmit?: () => void
}

/** A form element with app-standard styles. */
export class Form extends React.Component<IFormProps, {}> {
  public render() {
    const className = classNames('form-component', this.props.className)
    return (
      <form className={className} onSubmit={this.onSubmit}>
        {this.props.children}
      </form>
    )
  }

  private onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (this.props.onSubmit) {
      this.props.onSubmit()
    }
  }
}
