import React from 'react'

/** Horizontal rule/separator with optional title. */
export const HorizontalRule: React.FunctionComponent<{
  readonly title?: string
}> = props => (
  <div className="horizontal-rule">
    <span className="horizontal-rule-content">{props.title}</span>
  </div>
)
