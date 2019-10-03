import * as React from 'react'

import { encodePathAsUrl } from '../../lib/path'
import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'
import { PopupType } from '../../models/popup'
import { Octicon, OcticonSymbol } from '../octicons'
import { BlankslateAction } from '../changes/blankslate-action'

const ClappingHandsImage = encodePathAsUrl(
  __dirname,
  'static/admin-mentoring.svg'
)

interface ITutorialDoneProps {
  readonly dispatcher: Dispatcher

  /**
   * The currently selected repository
   */
  readonly repository: Repository
}
export class TutorialDone extends React.Component<ITutorialDoneProps, {}> {
  public render() {
    return (
      <div id="tutorial-done">
        <div className="content">
          <div className="header">
            <div className="text">
              <h1>You're done!</h1>
              <p>
                You’ve learned the basics on how to use GitHub Desktop. Here are
                some suggestions for what to do next.
              </p>
            </div>
            <img src={ClappingHandsImage} className="image" />
          </div>
          {this.renderActions()}
        </div>
      </div>
    )
  }

  private renderActions() {
    return (
      <ul className="actions">
        {this.renderExploreProjects()}
        {this.renderStartNewProject()}
        {this.renderAddLocalRepo()}
      </ul>
    )
  }

  private renderExploreProjects() {
    return (
      <BlankslateAction
        title="Explore projects on GitHub"
        description="Contribute to a project that interests you"
        buttonText={__DARWIN__ ? 'Open in Browser' : 'Open in browser'}
        onClick={this.openDotcomExplore}
        type="normal"
        image={<Octicon symbol={OcticonSymbol.telescope} />}
      />
    )
  }

  private renderStartNewProject() {
    return (
      <BlankslateAction
        title="Create a new repository"
        description="Get started on a brand new project"
        buttonText={__DARWIN__ ? 'Create Repository' : 'Create repository'}
        onClick={this.onCreateNewRepository}
        type="normal"
        image={<Octicon symbol={OcticonSymbol.plus} />}
      />
    )
  }

  private renderAddLocalRepo() {
    return (
      <BlankslateAction
        title="Add a local repository"
        description="Work on an existing project in GitHub Desktop"
        buttonText={__DARWIN__ ? 'Add Repository' : 'Add repository'}
        onClick={this.onAddExistingRepository}
        type="normal"
        image={<Octicon symbol={OcticonSymbol.fileDirectory} />}
      />
    )
  }

  private openDotcomExplore = () => {
    this.props.dispatcher.showGitHubExplore(this.props.repository)
  }

  private onCreateNewRepository = () => {
    this.props.dispatcher.showPopup({
      type: PopupType.CreateRepository,
    })
  }

  private onAddExistingRepository = () => {
    this.props.dispatcher.showPopup({
      type: PopupType.AddRepository,
    })
  }
}
