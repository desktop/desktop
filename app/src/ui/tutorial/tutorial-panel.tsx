import * as React from 'react'
import { join } from 'path'
import { LinkButton } from '../lib/link-button'
import { Button } from '../lib/button'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import {
  ValidTutorialStep,
  TutorialStep,
  orderedTutorialSteps,
} from '../../models/tutorial-step'
import { encodePathAsUrl } from '../../lib/path'
import { PopupType } from '../../models/popup'
import { PreferencesTab } from '../../models/preferences'
import { Ref } from '../lib/ref'
import { suggestedExternalEditor } from '../../lib/editors/shared'
import { TutorialStepInstructions } from './tutorial-step-instruction'
import { KeyboardShortcut } from '../keyboard-shortcut/keyboard-shortcut'

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
  readonly resolvedExternalEditor: string | null
  readonly currentTutorialStep: ValidTutorialStep
  readonly onExitTutorial: () => void
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
    // This will cause the tutorial pull request step to close first.
    this.props.dispatcher.markPullRequestTutorialStepAsComplete(
      this.props.repository
    )

    // wait for the tutorial step to close before opening the PR, so that the
    // focusing of the "You're Done!" header is not interupted.
    setTimeout(() => {
      this.props.dispatcher.createPullRequest(this.props.repository)
    }, 500)
  }

  private skipEditorInstall = () => {
    this.props.dispatcher.skipPickEditorTutorialStep(this.props.repository)
  }

  private skipCreatePR = () => {
    this.props.dispatcher.markPullRequestTutorialStepAsComplete(
      this.props.repository
    )
  }

  private isStepComplete = (step: ValidTutorialStep) => {
    return (
      orderedTutorialSteps.indexOf(step) <
      orderedTutorialSteps.indexOf(this.props.currentTutorialStep)
    )
  }

  private isStepNextTodo = (step: ValidTutorialStep) => {
    return step === this.props.currentTutorialStep
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
          <h3>Get started</h3>
          <img src={TutorialPanelImage} alt="Partially checked check list" />
        </div>
        <ol>
          <TutorialStepInstructions
            summaryText="Install a text editor"
            isComplete={this.isStepComplete}
            isNextStepTodo={this.isStepNextTodo}
            sectionId={TutorialStep.PickEditor}
            currentlyOpenSectionId={this.state.currentlyOpenSectionId}
            skipLinkButton={<SkipLinkButton onClick={this.skipEditorInstall} />}
            onSummaryClick={this.onStepSummaryClick}
          >
            {!this.isStepComplete(TutorialStep.PickEditor) ? (
              <>
                <p className="description">
                  It doesn’t look like you have a text editor installed. We can
                  recommend{' '}
                  <LinkButton
                    uri={suggestedExternalEditor.url}
                    title={`Open the ${suggestedExternalEditor.name} website`}
                  >
                    {suggestedExternalEditor.name}
                  </LinkButton>
                  {` or `}
                  <LinkButton
                    uri="https://atom.io"
                    title="Open the Atom website"
                  >
                    Atom
                  </LinkButton>
                  , but feel free to use any.
                </p>
                <div className="action">
                  <LinkButton onClick={this.skipEditorInstall}>
                    I have an editor
                  </LinkButton>
                </div>
              </>
            ) : (
              <p className="description">
                Your default editor is{' '}
                <strong>{this.props.resolvedExternalEditor}</strong>. You can
                change your preferred editor in{' '}
                <LinkButton onClick={this.onPreferencesClick}>
                  {__DARWIN__ ? 'Settings' : 'options'}
                </LinkButton>
              </p>
            )}
          </TutorialStepInstructions>
          <TutorialStepInstructions
            summaryText="Create a branch"
            isComplete={this.isStepComplete}
            isNextStepTodo={this.isStepNextTodo}
            sectionId={TutorialStep.CreateBranch}
            currentlyOpenSectionId={this.state.currentlyOpenSectionId}
            onSummaryClick={this.onStepSummaryClick}
          >
            <p className="description">
              {`A branch allows you to work on different versions of a repository at one time. Create a
                branch by going into the branch menu in the top bar and
              clicking "${__DARWIN__ ? 'New Branch' : 'New branch'}".`}
            </p>
            <div className="action">
              <KeyboardShortcut
                darwinKeys={['⌘', '⇧', 'N']}
                keys={['Ctrl', 'Shift', 'N']}
              />
            </div>
          </TutorialStepInstructions>
          <TutorialStepInstructions
            summaryText="Edit a file"
            isComplete={this.isStepComplete}
            isNextStepTodo={this.isStepNextTodo}
            sectionId={TutorialStep.EditFile}
            currentlyOpenSectionId={this.state.currentlyOpenSectionId}
            onSummaryClick={this.onStepSummaryClick}
          >
            <p className="description">
              Open this repository in your preferred text editor. Edit the
              {` `}
              <Ref>README.md</Ref>
              {` `}
              file, save it, and come back.
            </p>
            {this.props.resolvedExternalEditor && (
              <div className="action">
                <Button onClick={this.openTutorialFileInEditor}>
                  {__DARWIN__ ? 'Open Editor' : 'Open editor'}
                </Button>
                <KeyboardShortcut
                  darwinKeys={['⌘', '⇧', 'A']}
                  keys={['Ctrl', 'Shift', 'A']}
                />
              </div>
            )}
          </TutorialStepInstructions>
          <TutorialStepInstructions
            summaryText="Make a commit"
            isComplete={this.isStepComplete}
            isNextStepTodo={this.isStepNextTodo}
            sectionId={TutorialStep.MakeCommit}
            currentlyOpenSectionId={this.state.currentlyOpenSectionId}
            onSummaryClick={this.onStepSummaryClick}
          >
            <p className="description">
              A commit allows you to save sets of changes. In the “summary“
              field in the bottom left, write a short message that describes the
              changes you made. When you’re done, click the blue Commit button
              to finish.
            </p>
          </TutorialStepInstructions>
          <TutorialStepInstructions
            summaryText="Publish to GitHub"
            isComplete={this.isStepComplete}
            isNextStepTodo={this.isStepNextTodo}
            sectionId={TutorialStep.PushBranch}
            currentlyOpenSectionId={this.state.currentlyOpenSectionId}
            onSummaryClick={this.onStepSummaryClick}
          >
            <p className="description">
              Publishing will “push”, or upload, your commits to this branch of
              your repository on GitHub. Publish using the third button in the
              top bar.
            </p>
            <div className="action">
              <KeyboardShortcut darwinKeys={['⌘', 'P']} keys={['Ctrl', 'P']} />
            </div>
          </TutorialStepInstructions>
          <TutorialStepInstructions
            summaryText="Open a pull request"
            isComplete={this.isStepComplete}
            isNextStepTodo={this.isStepNextTodo}
            sectionId={TutorialStep.OpenPullRequest}
            currentlyOpenSectionId={this.state.currentlyOpenSectionId}
            skipLinkButton={<SkipLinkButton onClick={this.skipCreatePR} />}
            onSummaryClick={this.onStepSummaryClick}
          >
            <p className="description">
              A pull request allows you to propose changes to the code. By
              opening one, you’re requesting that someone review and merge them.
              Since this is a demo repository, this pull request will be
              private.
            </p>
            <div className="action">
              <Button onClick={this.openPullRequest} role="link">
                {__DARWIN__ ? 'Open Pull Request' : 'Open pull request'}
                <Octicon symbol={octicons.linkExternal} />
              </Button>
              <KeyboardShortcut darwinKeys={['⌘', 'R']} keys={['Ctrl', 'R']} />
            </div>
          </TutorialStepInstructions>
        </ol>
        <div className="footer">
          <Button onClick={this.props.onExitTutorial}>
            {__DARWIN__ ? 'Exit Tutorial' : 'Exit tutorial'}
          </Button>
        </div>
      </div>
    )
  }
  /** this makes sure we only have one `TutorialListItem` open at a time */
  public onStepSummaryClick = (id: ValidTutorialStep) => {
    this.setState({ currentlyOpenSectionId: id })
  }

  private onPreferencesClick = () => {
    this.props.dispatcher.showPopup({
      type: PopupType.Preferences,
      initialSelectedTab: PreferencesTab.Integrations,
    })
  }
}

const SkipLinkButton: React.FunctionComponent<{
  onClick: () => void
}> = props => <LinkButton onClick={props.onClick}>Skip</LinkButton>
