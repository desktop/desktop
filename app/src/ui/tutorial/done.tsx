import * as React from 'react'

import { encodePathAsUrl } from '../../lib/path'
import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'
import { PopupType } from '../../models/popup'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { SuggestedAction } from '../suggested-actions'
import { SuggestedActionGroup } from '../suggested-actions'

const ClappingHandsImage = encodePathAsUrl(
  __dirname,
  'static/admin-mentoring.svg'
)

const TelescopeOcticon = <Octicon symbol={octicons.telescope} />
const PlusOcticon = <Octicon symbol={octicons.plus} />
const FileDirectoryOcticon = <Octicon symbol={octicons.fileDirectory} />

interface ITutorialDoneProps {
  readonly dispatcher: Dispatcher

  /**
   * The currently selected repository
   */
  readonly repository: Repository

  /**
   * If this has not happened, the tuturial completion header will be focused so
   * that it can be read by screen readers. The purpose of tracking this is so
   * the focus does not repeatedly get moved to this header if user is navigating
   * between repositories or history and changes view after completing the tutorial.
   */
  readonly tutorialCompletionAnnounced: boolean

  /**
   * Called when the tutorial completion header has been focused and read by
   * screen readers
   */
  readonly onTutorialCompletionAnnounced: () => void
}

export class TutorialDone extends React.Component<ITutorialDoneProps, {}> {
  private header = React.createRef<HTMLHeadingElement>()

  public componentDidMount() {
    if (this.header.current && !this.props.tutorialCompletionAnnounced) {
      // Add the header into the tab order so that it can be focused
      this.header.current.tabIndex = 0
      this.header.current?.focus()
      this.props.onTutorialCompletionAnnounced()
      this.header.current.tabIndex = -1
    }
  }

  public render() {
    return (
      <div id="tutorial-done">
        <div className="content">
          <div className="header">
            <div className="text">
              <h1 ref={this.header}>You're done!</h1>
              <p>
                You’ve learned the basics on how to use GitHub Desktop. Here are
                some suggestions for what to do next.
              </p>
            </div>
            <img
              src={ClappingHandsImage}
              className="image"
              alt="Hands clapping"
            />
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
