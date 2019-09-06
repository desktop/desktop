import * as React from 'react'
import { join } from 'path'
import { LinkButton } from '../lib/link-button'
import { Button } from '../lib/button'
import { Monospaced } from '../lib/monospaced'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { Octicon, OcticonSymbol } from '../octicons'

interface ITutorialPanelProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly externalEditorLabel?: string
}

export class TutorialPanel extends React.Component<
  ITutorialPanelProps,
  { openId: string }
> {
  public constructor(props: ITutorialPanelProps) {
    super(props)
    this.state = { openId: 'step-1' }
  }

  private openFileInEditor = () => {
    this.props.dispatcher.openInExternalEditor(
      join(this.props.repository.path, 'README.md')
    )
  }

  private openPullRequest = () => {
    this.props.dispatcher.createPullRequest(this.props.repository)
  }

  public render() {
    return (
      <div id="tutorial" className="panel">
        <div className="titleArea">
          <h1>Get started</h1>
          <Octicon symbol={OcticonSymbol.bell} />
        </div>
        <ol>
          <ListItem
            summaryText="Install a text editor"
            id="step-1"
            openId={this.state.openId}
            onClick={this.handleToggle}
          >
            <div className="description">
              It doesn’t look like you have a text editor installed. We can
              recommend{' '}
              <LinkButton uri="https://atom.io" title="Open the Atom website">
                Atom
              </LinkButton>
              {` or `}
              <LinkButton
                uri="https://code.visualstudio.com"
                title="Open the VS Code website"
              >
                Visual Studio Code
              </LinkButton>
              , but feel free to use any.
            </div>
            <LinkButton>I have an editor</LinkButton>
          </ListItem>
          <ListItem
            summaryText="Make a branch"
            id="step-2"
            openId={this.state.openId}
            onClick={this.handleToggle}
          >
            <div className="description">
              Create a branch by going into the branch menu in the top bar and
              clicking New Branch.
            </div>
            <span className="shortcut">⇧⌘N</span>
          </ListItem>
          <ListItem
            summaryText="Edit a file"
            id="step-3"
            openId={this.state.openId}
            onClick={this.handleToggle}
          >
            <div className="description">
              Open this repository in your preferred text editor. Edit the{' '}
              <Monospaced>README.md</Monospaced> file, save it, and come back.
            </div>
            <Button
              onClick={this.openFileInEditor}
              disabled={!this.props.externalEditorLabel}
            >
              Open Editor
            </Button>
            <span className="shortcut">⇧⌘A</span>
          </ListItem>
          <ListItem
            summaryText="Make a commit"
            id="step-4"
            openId={this.state.openId}
            onClick={this.handleToggle}
          >
            <div className="description">
              Write a message that describes the changes you made. When you’re
              done, click the commit button to finish.
            </div>
            <span className="shortcut">⌘ Enter</span>
          </ListItem>
          <ListItem
            summaryText="Push to GitHub"
            id="step-5"
            openId={this.state.openId}
            onClick={this.handleToggle}
          >
            <div className="description">
              Pushing your commits updates the repository on GitHub with any
              commits made on your computer to a branch.
            </div>
            <span className="shortcut">⌘P</span>
          </ListItem>
          <ListItem
            summaryText="Open a pull request"
            id="step-6"
            openId={this.state.openId}
            onClick={this.handleToggle}
          >
            <div className="description">
              Pull Requests are how you propose changes. By opening one, you’re
              requesting that someone review and merge them.
            </div>
            <Button onClick={this.openPullRequest}>Open pull request</Button>
            <span className="shortcut">⌘R</span>
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
          <summary>
            <div className="green-circle">
              <Octicon symbol={OcticonSymbol.check} />
            </div>
            <span className="summary-text">{this.props.summaryText}</span>
          </summary>
          <div className="contents">{this.props.children}</div>
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
