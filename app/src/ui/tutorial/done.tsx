import * as React from 'react'

import { encodePathAsUrl } from '../../lib/path'
import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'
import { PopupType } from '../../models/popup'
import { Octicon, OcticonSymbol } from '../octicons'
import { SuggestedAction } from '../suggested-actions'
import { SuggestedActionGroup } from '../suggested-actions'

const ClappingHandsImage = encodePathAsUrl(
  __dirname,
  'static/admin-mentoring.svg'
)

const TelescopeOcticon = <Octicon symbol={OcticonSymbol.telescope} />
const PlusOcticon = <Octicon symbol={OcticonSymbol.plus} />
const FileDirectoryOcticon = <Octicon symbol={OcticonSymbol.fileDirectory} />

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
          <SuggestedActionGroup>
            <SuggestedAction
              title="Explore projects on GitHub"
              description="Contribute to a project that interests you"
              buttonText={__DARWIN__ ? 'Open in Browser' : 'Open in browser'}
              onClick={this.openDotcomExplore}
              type="normal"
              image={TelescopeOcticon}
            />
            <SuggestedAction
              title="Create a new repository"
              description="Get started on a brand new project"
              buttonText={
                __DARWIN__ ? 'Create Repository' : 'Create repository'
              }
              onClick={this.onCreateNewRepository}
              type="normal"
              image={PlusOcticon}
            />
            <SuggestedAction
              title="Add a local repository"
              description="Work on an existing project in GitHub Desktop"
              buttonText={__DARWIN__ ? 'Add Repository' : 'Add repository'}
              onClick={this.onAddExistingRepository}
              type="normal"
              image={FileDirectoryOcticon}
            />
          </SuggestedActionGroup>
        </div>
      </div>
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
