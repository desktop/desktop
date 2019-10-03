import * as React from 'react'

import { encodePathAsUrl } from '../../lib/path'
import { Button } from '../lib/button'
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
      <li className="blankslate-action">
        <div className="image-wrapper">
          <Octicon symbol={OcticonSymbol.telescope} />
        </div>
        <div className="text-wrapper">
          <h2>Explore projects on GitHub</h2>
          <p className="description">
            Contribute to a project that interests you
          </p>
        </div>
        <Button onClick={this.openDotcomExplore}>
          {__DARWIN__ ? 'Open in Browser' : 'Open in browser'}
        </Button>
      </li>
    )
  }

  private renderStartNewProject() {
    return (
      <li className="blankslate-action">
        <div className="image-wrapper">
          <Octicon symbol={OcticonSymbol.plus} />
        </div>
        <div className="text-wrapper">
          <h2>Create a new repository</h2>
          <p className="description">Get started on a brand new project</p>
        </div>
        <Button onClick={this.onCreateNewRepository}>
          {__DARWIN__ ? 'Create Repository' : 'Create repository'}
        </Button>
      </li>
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
