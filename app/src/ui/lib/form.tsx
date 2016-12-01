import * as React from 'react'

interface IFormProps {
  readonly className?: string
  readonly onSubmit?: () => void
}

export class Form extends React.Component<IFormProps, void> {
  public render() {
    return (
      <form className={`form-component ${this.props.className}`} onSubmit={this.onSubmit}>
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
