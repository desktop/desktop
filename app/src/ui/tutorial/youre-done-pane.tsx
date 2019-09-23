import * as React from 'react'

import { encodePathAsUrl } from '../../lib/path'
import { Button } from '../lib/button'
import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'
import { PopupType } from '../../models/popup'

const TutorialPanelImage = encodePathAsUrl(
  __dirname,
  'static/required-status-check.svg'
)

interface IYoureDonePaneProps {
  readonly dispatcher: Dispatcher

  /**
   * The currently selected repository
   */
  readonly repository: Repository
}
export class YoureDonePane extends React.Component<IYoureDonePaneProps, {}> {
  public render() {
    return (
      <div id="youre-done-tutorial">
        <div className="content">
          <div className="header">
            <div className="text">
              <h1>You're done!</h1>
              <p>
                You’ve learned the basics on how to use GitHub Desktop.
                <br />
                Here are some suggestions for what to do next.
              </p>
            </div>
            <img src={TutorialPanelImage} className="youre-done-image" />
          </div>
          {this.renderActions()}
        </div>
      </div>
    )
  }

  private renderActions() {
    return (
      <div className="actions">
        {this.renderExploreProjects()}
        {this.renderStartNewProject()}
        {this.renderAddLocalRepo()}
      </div>
    )
  }

  private renderExploreProjects() {
    return (
      <div>
        <img src={TutorialPanelImage} className="youre-done-image" />
        <div className="text-wrapper">
          <h2>Explore projects on GitHub</h2>
          <p className="description">
            Contribute to a project that interests you
          </p>
        </div>
        <Button type="submit" onClick={this.openDotcomExplore}>
          Open in browser
        </Button>
      </div>
    )
  }

  private renderStartNewProject() {
    return (
      <div>
        <img src={TutorialPanelImage} className="youre-done-image" />
        <div className="text-wrapper">
          <h2>Start a new project</h2>
          <p className="description">Start a new project</p>
        </div>
        <Button type="submit" onClick={this.onCreateNewRepository}>
          Create repository
        </Button>
      </div>
    )
  }

  private renderAddLocalRepo() {
    return (
      <div>
        <img src={TutorialPanelImage} className="youre-done-image" />
        <div className="text-wrapper">
          <h2>Add a local repository</h2>
          <p className="description">
            Work on an existing project in GitHub Desktop
          </p>
        </div>
        <Button type="submit">Add repository</Button>
      </div>
    )
  }

  private openDotcomExplore = () => {
    this.props.dispatcher.showDotcomExplore(this.props.repository)
  }

  private onCreateNewRepository = () => {
    this.props.dispatcher.showPopup({
      type: PopupType.CreateRepository,
    })
  }
}
