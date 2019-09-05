import * as React from 'react'

export class TutorialPanel extends React.Component<{}, { openId: string }> {
  public constructor(props: {}) {
    super(props)
    this.state = { openId: 'step-1' }
  }

  public render() {
    return (
      <div id="tutorial" className="panel">
        <ol>
          <ListItem
            summaryText="Step 1"
            id="step-1"
            openId={this.state.openId}
            onClick={this.handleToggle}
          />
          <ListItem
            summaryText="Step 2"
            id="step-2"
            openId={this.state.openId}
            onClick={this.handleToggle}
          />
          <ListItem
            summaryText="Step 3"
            id="step-3"
            openId={this.state.openId}
            onClick={this.handleToggle}
          />
          <ListItem
            summaryText="Step 4"
            id="step-4"
            openId={this.state.openId}
            onClick={this.handleToggle}
          />
          <ListItem
            summaryText="Step 5"
            id="step-5"
            openId={this.state.openId}
            onClick={this.handleToggle}
          />
          <ListItem
            summaryText="Step 6"
            id="step-6"
            openId={this.state.openId}
            onClick={this.handleToggle}
          />
        </ol>
      </div>
    )
  }
  public handleToggle = (id: string) => {
    this.setState({ openId: id })
  }
}

class ListItem extends React.PureComponent<{
  readonly summaryText: string
  readonly id: string
  readonly openId: string
  readonly onClick: (id: string) => void
}> {
  public render() {
    return (
      <li key={this.props.id}>
        <details
          open={this.props.id === this.props.openId}
          onClick={this.onClick}
        >
          <summary>{this.props.summaryText}</summary>
          {`description and details for ${this.props.summaryText} here!`}
        </details>
      </li>
    )
  }
  private onClick = (e: React.MouseEvent<HTMLElement>) => {
    // prevents the default behavior of toggling on a `details` html element
    // so we don't have to fight it with our react state
    // for more info see:
    // https://developer.mozilla.org/en-US/docs/Web/HTML/Element/details#Events
    e.preventDefault()
    this.props.onClick(this.props.id)
  }
}
