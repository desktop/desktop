import * as React from 'react'
import * as classNames from 'classnames'

interface IRowProps {
  readonly className?: string

  readonly children?: ReadonlyArray<JSX.Element>
}

/** A row element with app-standard styles. */
export class Row extends React.Component<IRowProps, void> {
  public render() {
    const className = classNames('row-component', this.props.className)
    return (
      <div className={className}>
        {this.props.children}
      </div>
    )
  }
}
