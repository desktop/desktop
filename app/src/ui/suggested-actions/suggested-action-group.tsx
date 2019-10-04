import * as React from 'react'

/**
 * Wrapper for a list of suggested action components.
 * Primarily provides extra css styling.
 */
export const SuggestedActionGroup: React.SFC = props => (
  <div className="suggested-action-group">{props.children}</div>
)
