import * as React from 'react'
import * as classNames from 'classnames'

interface IErrorsProps {
  /** The class name for the internal element. */
  readonly className?: string

  /** The children to be displayed as an error message. */
  readonly children?: ReadonlyArray<JSX.Element>
}

/** An Errors element with app-standard styles. */
export class Errors extends React.Component<IErrorsProps, void> {
  public render() {
    const className = classNames('errors-component', this.props.className)
    return (
      <div className={className}>
        {this.props.children}
      </div>
    )
  }
}
