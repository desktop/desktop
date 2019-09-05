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
          >
            <div>
              It doesn’t look like you have a text editor installed. We can
              recommend Atom or Visual Studio Code, but feel free to use any.
            </div>
            <div>I have an editor</div>
          </ListItem>
          <ListItem
            summaryText="Step 2"
            id="step-2"
            openId={this.state.openId}
            onClick={this.handleToggle}
          >
            <div>
              Create a branch by going into the branch menu in the top bar and
              clicking New Branch.
            </div>
            <div> ⇧⌘N</div>
          </ListItem>
          <ListItem
            summaryText="Step 3"
            id="step-3"
            openId={this.state.openId}
            onClick={this.handleToggle}
          >
            <div>
              Open this repository in your preferred text editor. Edit the
              README.md file, save it, and come back.
            </div>
            <button>Open Editor</button>
            <div>⇧⌘A</div>
          </ListItem>
          <ListItem
            summaryText="Step 4"
            id="step-4"
            openId={this.state.openId}
            onClick={this.handleToggle}
          >
            <div>
              Write a message that describes the changes you made. When you’re
              done, click the commit button to finish.
            </div>
            <div>⌘ Enter</div>
          </ListItem>
          <ListItem
            summaryText="Step 5"
            id="step-5"
            openId={this.state.openId}
            onClick={this.handleToggle}
          >
            <div>
              Pushing your commits updates the repository on GitHub with any
              commits made on your computer to a branch.
            </div>
            <div>⌘P</div>
          </ListItem>
          <ListItem
            summaryText="Step 6"
            id="step-6"
            openId={this.state.openId}
            onClick={this.handleToggle}
          >
            <div>
              Pull Requests are how you propose changes. By opening one, you’re
              requesting that someone review and merge them.
            </div>
            <button>Open pull request</button>
            <div>⌘R</div>
          </ListItem>
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
          {this.props.children}
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
