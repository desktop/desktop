import * as React from 'react'

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
        </div>
      </div>
    )
  }
}
