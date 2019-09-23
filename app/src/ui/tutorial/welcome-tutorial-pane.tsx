import * as React from 'react'

import { encodePathAsUrl } from '../../lib/path'

const TutorialPanelImage = encodePathAsUrl(
  __dirname,
  'static/required-status-check.svg'
)
export class WelcomeTutorialPane extends React.Component {
  public render() {
    return (
      <div id="welcome-tutorial">
        <div className="content">
          <div className="header">
            <div className="text">
              <h1>Welcome to GitHub Desktop</h1>
              <p>
                Use this tutorial to get comfortable with Git, GitHub, and
                GitHub Desktop.
              </p>
            </div>
          </div>
          <div className="descriptions">
            <div>
              <img src={TutorialPanelImage} />
              <div>
                <strong>Git</strong> is the version control system.
              </div>
            </div>
            <div>
              <img src={TutorialPanelImage} />
              <div>
                <strong>GitHub</strong> is where you store your code and
                collaborate with others.
              </div>
            </div>
            <div>
              <img src={TutorialPanelImage} />
              <div>
                <strong>GitHub Desktop</strong> helps you work with GitHub
                locally.
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }
}
