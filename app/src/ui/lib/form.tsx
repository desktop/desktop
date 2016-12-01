import * as React from 'react'
import * as classNames from 'classnames'

interface IFormProps {
  readonly className?: string
  readonly onSubmit?: () => void
}

export class Form extends React.Component<IFormProps, void> {
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
