import * as React from 'react'
import { join } from 'path'
import { LinkButton } from '../lib/link-button'
import { Button } from '../lib/button'
import { Monospaced } from '../lib/monospaced'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'

interface ITutorialPanelProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository

  /** name of the configured external editor
   * (`undefined` if none is configured.)
   */
  readonly externalEditorLabel?: string
}

interface ITutorialPanelState {
  /** ID of the currently expanded tutorial step */
  readonly currentlyOpenSectionId: string
}

/** The Onboarding Tutorial Panel
 *  Renders a list of expandable tutorial steps (`TutorialListItem`).
 *  Enforces only having one step expanded at a time through
 *  event callbacks and local state.
 */
export class TutorialPanel extends React.Component<
  ITutorialPanelProps,
  ITutorialPanelState
> {
  public constructor(props: ITutorialPanelProps) {
    super(props)
    this.state = { currentlyOpenSectionId: 'step-1' }
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
      <div className="tutorial-panel-component panel">
        <ol>
          <TutorialListItem
            summaryText="Install a text editor"
            sectionId="step-1"
            currentlyOpenSectionId={this.state.currentlyOpenSectionId}
            onClick={this.handleToggle}
          >
            <div>
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
          </TutorialListItem>
          <TutorialListItem
            summaryText="Make a branch"
            sectionId="step-2"
            currentlyOpenSectionId={this.state.currentlyOpenSectionId}
            onClick={this.handleToggle}
          >
            <div>
              Create a branch by going into the branch menu in the top bar and
              clicking New Branch.
            </div>
            <kbd>⇧⌘N</kbd>
          </TutorialListItem>
          <TutorialListItem
            summaryText="Edit a file"
            sectionId="step-3"
            currentlyOpenSectionId={this.state.currentlyOpenSectionId}
            onClick={this.handleToggle}
          >
            <div>
              Open this repository in your preferred text editor. Edit the{' '}
              <Monospaced>README.md</Monospaced> file, save it, and come back.
            </div>
            <Button
              onClick={this.openFileInEditor}
              disabled={!this.props.externalEditorLabel}
            >
              {__DARWIN__ ? 'Open Editor' : 'Open editor' }
            </Button>
            <kbd>⇧⌘A</kbd>
          </TutorialListItem>
          <TutorialListItem
            summaryText="Make a commit"
            sectionId="step-4"
            currentlyOpenSectionId={this.state.currentlyOpenSectionId}
            onClick={this.handleToggle}
          >
            <div>
              Write a message that describes the changes you made. When you’re
              done, click the commit button to finish.
            </div>
            <kbd>⌘ Enter</kbd>
          </TutorialListItem>
          <TutorialListItem
            summaryText="Push to GitHub"
            sectionId="step-5"
            currentlyOpenSectionId={this.state.currentlyOpenSectionId}
            onClick={this.handleToggle}
          >
            <div>
              Pushing your commits updates the repository on GitHub with any
              commits made on your computer to a branch.
            </div>
            <kbd>⌘P</kbd>
          </TutorialListItem>
          <TutorialListItem
            summaryText="Open a pull request"
            sectionId="step-6"
            currentlyOpenSectionId={this.state.currentlyOpenSectionId}
            onClick={this.handleToggle}
          >
            <div>
              Pull Requests are how you propose changes. By opening one, you’re
              requesting that someone review and merge them.
            </div>
            <Button onClick={this.openPullRequest}>
              {__DARWIN__ ? 'Open Pull Request' : 'Open pull request'}
            </Button>
            <kbd>⌘R</kbd>
          </TutorialListItem>
        </ol>
      </div>
    )
  }
  /** this makes sure we only have one `TutorialListItem` open at a time */
  public handleToggle = (id: string) => {
    this.setState({ currentlyOpenSectionId: id })
  }
}

/** A step (summary and expandable description) in the tutorial side panel */
class TutorialListItem extends React.PureComponent<{
  /** Text displayed to summarize this step */
  readonly summaryText: string
  /** ID for this section */
  readonly sectionId: string

  /** ID of the currently expanded tutorial step
   * (used to determine if this step is expanded)
   */
  readonly currentlyOpenSectionId: string

  /** Handler to open and close section */
  readonly onClick: (id: string) => void
}> {
  public render() {
    return (
      <li key={this.props.sectionId}>
        <details
          open={this.props.sectionId === this.props.currentlyOpenSectionId}
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
    this.props.onClick(this.props.sectionId)
  }
}
