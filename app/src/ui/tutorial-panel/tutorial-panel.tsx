import * as React from 'react'

export const TutorialPanel: React.SFC<{}> = props => (
  <div id="tutorial" className="panel">
    <ol>
      <ListItem summaryText="Step 1" />
      <ListItem summaryText="Step 2" />
      <ListItem summaryText="Step 3" />
      <ListItem summaryText="Step 4" />
      <ListItem summaryText="Step 5" />
      <ListItem summaryText="Step 6" />
    </ol>
  </div>
)

const ListItem: React.SFC<{
  readonly summaryText: string
  readonly open?: boolean
}> = props => (
  <li key={props.summaryText}>
    <details open={props.open}>
      <summary>{props.summaryText}</summary>
      {`description and details for ${props.summaryText} here!`}
    </details>
  </li>
)
