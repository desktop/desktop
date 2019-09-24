import * as React from 'react'

import { encodePathAsUrl } from '../../lib/path'

const CodeImage = encodePathAsUrl(__dirname, 'static/code.svg')
const TeamDiscussionImage = encodePathAsUrl(
  __dirname,
  'static/github-for-teams.svg'
)
const CloudServerImage = encodePathAsUrl(
  __dirname,
  'static/github-for-business.svg'
)

export class TutorialWelcome extends React.Component {
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
          <ul className="descriptions">
            <li>
              <img src={CodeImage} />
              <div>
                <strong>Git</strong> is the version control system.
              </div>
            </li>
            <li>
              <img src={TeamDiscussionImage} />
              <div>
                <strong>GitHub</strong> is where you store your code and
                collaborate with others.
              </div>
            </li>
            <li>
              <img src={CloudServerImage} />
              <div>
                <strong>GitHub Desktop</strong> helps you work with GitHub
                locally.
              </div>
            </li>
          </ul>
        </div>
      </div>
    )
  }
}
