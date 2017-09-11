import * as React from 'react'

/** A component for monospaced text. */
export class Monospaced extends React.Component<{}, {}> {
  public render() {
    return <span className="monospaced">{this.props.children}</span>
  }
}
