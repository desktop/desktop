import * as React from 'react'
import { join } from 'path'
import { LinkButton } from '../lib/link-button'
import { Button } from '../lib/button'
import { Monospaced } from '../lib/monospaced'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { Octicon, OcticonSymbol } from '../octicons'
import { Fragment } from 'react'
import {
  ValidTutorialStep,
  TutorialStep,
  orderedSteps,
} from '../../models/tutorial-step'

interface ITutorialPanelProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly externalEditorLabel?: string
  readonly currentTutorialStep: ValidTutorialStep
}

export class TutorialPanel extends React.Component<
  ITutorialPanelProps,
  { openId: ValidTutorialStep }
> {
  public constructor(props: ITutorialPanelProps) {
    super(props)
    this.state = {
      openId: this.props.currentTutorialStep,
    }
  }

  private openFileInEditor = () => {
    this.props.dispatcher.openInExternalEditor(
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
        openId: nextProps.currentTutorialStep,
      })
    }
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
            stepNumber={1}
            summaryText="Install a text editor"
            isComplete={this.isStepComplete}
            id={TutorialStep.PickEditor}
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
            <LinkButton onClick={this.skipEditorInstall}>
              I have an editor
            </LinkButton>
            <LinkButton onClick={this.skipEditorInstall}>Skip</LinkButton>
          </ListItem>
          <ListItem
            stepNumber={2}
            summaryText="Make a branch"
            isComplete={this.isStepComplete}
            id={TutorialStep.CreateBranch}
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
            stepNumber={3}
            summaryText="Edit a file"
            isComplete={this.isStepComplete}
            id={TutorialStep.EditFile}
            openId={this.state.openId}
            onClick={this.handleToggle}
          >
            <div className="description">
              Open this repository in your preferred text editor. Edit the{' '}
              <Monospaced>README.md</Monospaced> file, save it, and come back.
            </div>
            {this.props.externalEditorLabel ? (
              <Fragment>
                <Button onClick={this.openFileInEditor}>Open Editor</Button>
                <span className="shortcut">⇧⌘A</span>
              </Fragment>
            ) : null}
          </ListItem>
          <ListItem
            stepNumber={4}
            summaryText="Make a commit"
            isComplete={this.isStepComplete}
            id={TutorialStep.MakeCommit}
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
            stepNumber={5}
            summaryText="Push to GitHub"
            isComplete={this.isStepComplete}
            id={TutorialStep.PushBranch}
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
            stepNumber={6}
            summaryText="Open a pull request"
            isComplete={this.isStepComplete}
            id={TutorialStep.OpenPullRequest}
            openId={this.state.openId}
            onClick={this.handleToggle}
          >
            <div className="description">
              Pull Requests are how you propose changes. By opening one, you’re
              requesting that someone review and merge them.
            </div>
            <Button onClick={this.openPullRequest}>Open pull request</Button>
            <span className="shortcut">⌘R</span>
            <LinkButton onClick={this.skipCreatePR}>Skip</LinkButton>
          </ListItem>
        </ol>
      </div>
    )
  }

  public handleToggle = (id: ValidTutorialStep) => {
    this.setState({ openId: id })
  }
}

class ListItem extends React.PureComponent<{
  readonly summaryText: string
  readonly stepNumber: number
  readonly isComplete: (step: ValidTutorialStep) => boolean
  readonly id: ValidTutorialStep
  readonly openId: string | null
  readonly onClick: (id: ValidTutorialStep) => void
}> {
  public render() {
    return (
      <li key={this.props.id} onClick={this.onClick}>
        <details
          open={this.props.id === this.props.openId}
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
        this.props.isComplete(this.props.id),
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
    this.props.onClick(this.props.id)
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
