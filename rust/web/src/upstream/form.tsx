import * as React from 'react'

interface IFormProps {
  readonly id?: string
  /** The class name for the form. */
  readonly className?: string

  /** Called when the form is submitted. */
  readonly onSubmit?: () => void
}

/** A form element with app-standard styles. */
export class Form extends React.Component<IFormProps, {}> {
  public render() {
    const className = ['form-component', this.props.className]
      .filter(Boolean)
      .join(' ')
    return (
      <form id={this.props.id} className={className} onSubmit={this.onSubmit}>
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
