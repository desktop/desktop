import * as React from 'react'
import { join } from 'path'
import { LinkButton } from '../lib/link-button'
import { Button } from '../lib/button'
import { Monospaced } from '../lib/monospaced'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { Octicon, OcticonSymbol } from '../octicons'
import {
  ValidTutorialStep,
  TutorialStep,
  orderedSteps,
} from '../../models/tutorial-step'

interface ITutorialPanelProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository

  /** name of the configured external editor
   * (`undefined` if none is configured.)
   */
  readonly externalEditorLabel?: string
  readonly currentTutorialStep: ValidTutorialStep
}

interface ITutorialPanelState {
  /** ID of the currently expanded tutorial step */
  readonly currentlyOpenSectionId: ValidTutorialStep
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
    this.state = { currentlyOpenSectionId: this.props.currentTutorialStep }
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

  private skipEditorInstall = () => {
    this.props.dispatcher.skipEditorInstall()
  }

  private skipCreatePR = () => {
    this.props.dispatcher.skipCreatePR()
  }

  private isStepComplete = (step: ValidTutorialStep) => {
    return (
      orderedSteps.indexOf(step) <
      orderedSteps.indexOf(this.props.currentTutorialStep)
    )
  }

  public componentWillReceiveProps(nextProps: ITutorialPanelProps) {
    if (this.props.currentTutorialStep !== nextProps.currentTutorialStep) {
      this.setState({
        currentlyOpenSectionId: nextProps.currentTutorialStep,
      })
    }
  }

  public render() {
    return (
      <div className="tutorial-panel-component panel">
        <div className="titleArea">
          <h1>Get started</h1>
          <Octicon symbol={OcticonSymbol.bell} />
        </div>
        <ol>
          <TutorialListItem
            stepNumber={1}
            summaryText="Install a text editor"
            isComplete={this.isStepComplete}
            sectionId={TutorialStep.PickEditor}
            currentlyOpenSectionId={this.state.currentlyOpenSectionId}
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
            <LinkButton onClick={this.skipEditorInstall}>
              I have an editor
            </LinkButton>
            <LinkButton onClick={this.skipEditorInstall}>Skip</LinkButton>
          </TutorialListItem>
          <TutorialListItem
            stepNumber={2}
            summaryText="Make a branch"
            isComplete={this.isStepComplete}
            sectionId={TutorialStep.CreateBranch}
            currentlyOpenSectionId={this.state.currentlyOpenSectionId}
            onClick={this.handleToggle}
          >
            <div className="description">
              {`Create a branch by going into the branch menu in the top bar and
              clicking "${__DARWIN__ ? 'New Branch' : 'New branch'}".`}
            </div>
            <span className="shortcut">⇧⌘N</span>
          </TutorialListItem>
          <TutorialListItem
            stepNumber={3}
            summaryText="Edit a file"
            isComplete={this.isStepComplete}
            sectionId={TutorialStep.EditFile}
            currentlyOpenSectionId={this.state.currentlyOpenSectionId}
            onClick={this.handleToggle}
          >
            <div className="description">
              Open this repository in your preferred text editor. Edit the{' '}
              <Monospaced>README.md</Monospaced> file, save it, and come back.
            </div>
            {this.props.externalEditorLabel ? (
              <>
                <Button onClick={this.openTutorialFileInEditor}>
                  {__DARWIN__ ? 'Open Editor' : 'Open editor'}
                </Button>
                <span className="shortcut">⇧⌘A</span>
              </>
            ) : null}
          </TutorialListItem>
          <TutorialListItem
            stepNumber={4}
            summaryText="Make a commit"
            isComplete={this.isStepComplete}
            sectionId={TutorialStep.MakeCommit}
            currentlyOpenSectionId={this.state.currentlyOpenSectionId}
            onClick={this.handleToggle}
          >
            <div className="description">
              Write a message that describes the changes you made. When you’re
              done, click the commit button to finish.
            </div>
            <span className="shortcut">⌘ Enter</span>
          </TutorialListItem>
          <TutorialListItem
            stepNumber={5}
            summaryText="Push to GitHub"
            isComplete={this.isStepComplete}
            sectionId={TutorialStep.PushBranch}
            currentlyOpenSectionId={this.state.currentlyOpenSectionId}
            onClick={this.handleToggle}
          >
            <div className="description">
              Pushing your commits updates the repository on GitHub with any
              commits made on your computer to a branch.
            </div>
            <span className="shortcut">⌘P</span>
          </TutorialListItem>
          <TutorialListItem
            stepNumber={6}
            summaryText="Open a pull request"
            isComplete={this.isStepComplete}
            sectionId={TutorialStep.OpenPullRequest}
            currentlyOpenSectionId={this.state.currentlyOpenSectionId}
            onClick={this.handleToggle}
          >
            <div className="description">
              Pull Requests are how you propose changes. By opening one, you’re
              requesting that someone review and merge them.
            </div>
            <Button onClick={this.openPullRequest}>
              {__DARWIN__ ? 'Open Pull Request' : 'Open pull request'}
            </Button>
            <span className="shortcut">⌘R</span>
            <LinkButton onClick={this.skipCreatePR}>Skip</LinkButton>
          </TutorialListItem>
        </ol>
      </div>
    )
  }
  /** this makes sure we only have one `TutorialListItem` open at a time */
  public handleToggle = (id: ValidTutorialStep) => {
    this.setState({ currentlyOpenSectionId: id })
  }
}

/** A step (summary and expandable description) in the tutorial side panel */
class TutorialListItem extends React.PureComponent<{
  /** Text displayed to summarize this step */
  readonly summaryText: string
  readonly stepNumber: number
  readonly isComplete: (step: ValidTutorialStep) => boolean
  /** ID for this section */
  readonly sectionId: ValidTutorialStep

  /** ID of the currently expanded tutorial step
   * (used to determine if this step is expanded)
   */
  readonly currentlyOpenSectionId: string | null
  /** Handler to open and close section */
  readonly onClick: (id: ValidTutorialStep) => void
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
      {renderTutorialStepIcon(
        this.props.isComplete(this.props.sectionId),
        this.props.stepNumber
      )}
      <span className="summary-text">{this.props.summaryText}</span>
      <Octicon className="chevron-icon" symbol={OcticonSymbol.chevronDown} />
    </summary>
  )

  private onClick = (e: React.MouseEvent<HTMLElement>) => {
    // prevents the default behavior of toggling on a `details` html element
    // so we don't have to fight it with our react state
    // for more info see:
    // https://developer.mozilla.org/en-US/docs/Web/HTML/Element/details#Events
    e.preventDefault()
    this.props.onClick(this.props.sectionId)
  }
}

function renderTutorialStepIcon(completed: boolean, stepNumber: number) {
  return completed ? (
    <div className="green-circle">
      <Octicon symbol={OcticonSymbol.check} />
    </div>
  ) : (
    <div className="blue-circle">{stepNumber}</div>
  )
}
