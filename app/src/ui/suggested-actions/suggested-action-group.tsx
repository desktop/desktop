import * as React from 'react'

/**
 * Wrapper for a list of suggested action components.
 * Primarily provides extra css styling.
 */
export class SuggestedActionGroup extends React.Component<{}, {}> {
  public render() {
    return <div className="suggested-action-group">{this.props.children}</div>
  }
}
