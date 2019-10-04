import * as React from 'react'

/**
 * Wraps a list of suggested action components with extra styling.
 */
export const SuggestedActionGroup: React.SFC = props => (
  <div className="suggested-action-group">{props.children}</div>
)
