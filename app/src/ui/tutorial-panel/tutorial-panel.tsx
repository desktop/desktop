import * as React from 'react'
import { join } from 'path'
import { LinkButton } from '../lib/link-button'
import { Button } from '../lib/button'
import { Monospaced } from '../lib/monospaced'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { Octicon, OcticonSymbol } from '../octicons'
import { encodePathAsUrl } from '../../lib/path'

const TutorialPanelImage = encodePathAsUrl(
  __dirname,
  'static/required-status-check.svg'
)

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

  private openTutorialFileInEditor = () => {
    this.props.dispatcher.openInExternalEditor(
      // TODO: tie this filename to a shared constant
      // for tutorial repos
      join(this.props.repository.path, 'README.md')
    )
  }

  private openPullRequest = () => {
    this.props.dispatcher.createPullRequest(this.props.repository)
  }

  public render() {
    const currentSectionId = 'step-3'
    return (
      <div className="tutorial-panel-component panel">
        <div className="titleArea">
          <h3>Get started</h3>
          <img src={TutorialPanelImage} />
        </div>
        <ol>
          <TutorialListItem
            stepNumber={1}
            summaryText="Install a text editor"
            sectionId="step-1"
            completed={true}
            currentSectionId={currentSectionId}
            currentlyOpenSectionId={this.state.currentlyOpenSectionId}
            onClick={this.handleToggle}
          >
            <p className="description">
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
            </p>
            <div className="action">
              <LinkButton>I have an editor</LinkButton>
            </div>
          </TutorialListItem>
          <TutorialListItem
            stepNumber={2}
            completed={true}
            summaryText="Make a branch"
            sectionId="step-2"
            currentSectionId={currentSectionId}
            currentlyOpenSectionId={this.state.currentlyOpenSectionId}
            onClick={this.handleToggle}
          >
            <p className="description">
              {`Create a branch by going into the branch menu in the top bar and
              clicking "${__DARWIN__ ? 'New Branch' : 'New branch'}".`}
            </p>
            <div className="action">
              <kbd>⇧</kbd>
              <kbd>⌘</kbd>
              <kbd>N</kbd>
            </div>
          </TutorialListItem>
          <TutorialListItem
            stepNumber={3}
            summaryText="Edit a file"
            sectionId="step-3"
            completed={false}
            currentSectionId={currentSectionId}
            currentlyOpenSectionId={this.state.currentlyOpenSectionId}
            onClick={this.handleToggle}
          >
            <p className="description">
              Open this repository in your preferred text editor. Edit the
              {` `}
              <Monospaced>README.md</Monospaced>
              {` `}
              file, save it, and come back.
            </p>
            <div className="action">
              <Button
                onClick={this.openTutorialFileInEditor}
                disabled={!this.props.externalEditorLabel}
              >
                {__DARWIN__ ? 'Open Editor' : 'Open editor'}
              </Button>

              <kbd>⇧</kbd>
              <kbd>⌘</kbd>
              <kbd>R</kbd>
            </div>
          </TutorialListItem>
          <TutorialListItem
            stepNumber={4}
            summaryText="Make a commit"
            completed={false}
            sectionId="step-4"
            currentSectionId={currentSectionId}
            currentlyOpenSectionId={this.state.currentlyOpenSectionId}
            onClick={this.handleToggle}
          >
            <p className="description">
              Write a message that describes the changes you made. When you’re
              done, click the commit button to finish.
            </p>
            <div className="action">
              <kbd>⌘</kbd>
              <kbd>Enter</kbd>
            </div>
          </TutorialListItem>
          <TutorialListItem
            stepNumber={5}
            summaryText="Push to GitHub"
            completed={false}
            sectionId="step-5"
            currentSectionId={currentSectionId}
            currentlyOpenSectionId={this.state.currentlyOpenSectionId}
            onClick={this.handleToggle}
          >
            <p className="description">
              Pushing your commits updates the repository on GitHub with any
              commits made on your computer to a branch.
            </p>
            <div className="action">
              <kbd>⌘</kbd>
              <kbd>P</kbd>
            </div>
          </TutorialListItem>
          <TutorialListItem
            stepNumber={6}
            summaryText="Open a pull request"
            completed={false}
            sectionId="step-6"
            currentSectionId={currentSectionId}
            currentlyOpenSectionId={this.state.currentlyOpenSectionId}
            onClick={this.handleToggle}
          >
            <p className="description">
              Pull Requests are how you propose changes. By opening one, you’re
              requesting that someone review and merge them.
            </p>
            <div className="action">
              <Button onClick={this.openPullRequest}>
                {__DARWIN__ ? 'Open Pull Request' : 'Open pull request'}
              </Button>
              <kbd>⌘</kbd>
              <kbd>R</kbd>
            </div>
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
  /** Where in the order of steps is this one? (1-6) */
  readonly stepNumber: number
  /** has this step been completed by the user already? */
  readonly completed: boolean
  /** The next step for the user to complete in the tutorial */
  readonly currentSectionId: string
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
      <li key={this.props.sectionId} onClick={this.onClick}>
        <details
          open={this.props.sectionId === this.props.currentlyOpenSectionId}
          onClick={this.onClick}
        >
          {this.renderSummary()}
          <div className="contents">{this.props.children}</div>
        </details>
      </li>
    )
  }

  private renderSummary = () => (
    <summary>
      {this.renderTutorialStepIcon()}
      <span className="summary-text">{this.props.summaryText}</span>
      <Octicon className="chevron-icon" symbol={OcticonSymbol.chevronDown} />
    </summary>
  )

  private renderTutorialStepIcon() {
    if (this.props.completed) {
      return (
        <div className="green-circle">
          <Octicon symbol={OcticonSymbol.check} />
        </div>
      )
    }

    return this.props.currentSectionId === this.props.sectionId ? (
      <div className="blue-circle">{this.props.stepNumber}</div>
    ) : (
      <div className="empty-circle">{this.props.stepNumber}</div>
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
