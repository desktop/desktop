import * as React from 'react'
import { UiView } from '../ui-view'
import { Button } from '../lib/button'
import { Octicon, OcticonSymbol } from '../octicons'
import {
  WelcomeLeftTopImageUri,
  WelcomeLeftBottomImageUri,
} from '../welcome/welcome'

interface IBlankSlateProps {
  /** A function to call when the user chooses to create a repository. */
  readonly onCreate: () => void

  /** A function to call when the user chooses to clone a repository. */
  readonly onClone: () => void

  /** A function to call when the user chooses to add a local repository. */
  readonly onAdd: () => void
}

/**
 * The blank slate view. This is shown when the user hasn't added any
 * repositories to the app.
 */
export class BlankSlateView extends React.Component<IBlankSlateProps, {}> {
  public render() {
    return (
      <UiView id="blank-slate">
        <header>
          <h1>Let's get started!</h1>
          <p>Add a repository to GitHub Desktop to start collaborating</p>
        </header>

        <div className="content">
          <div className="content-pane">
            <ul className="button-group">
              <li>
                <Button onClick={this.props.onClone}>
                  <Octicon symbol={OcticonSymbol.repoClone} />
                  <div>
                    {__DARWIN__
                      ? 'Clone a Repository from the Internet…'
                      : 'Clone a repository from the Internet…'}
                  </div>
                </Button>
              </li>
              <li>
                <Button onClick={this.props.onCreate}>
                  <Octicon symbol={OcticonSymbol.plus} />
                  <div>
                    {__DARWIN__
                      ? 'Create a New Repository on Your Hard Drive…'
                      : 'Create a New Repository on your hard drive…'}
                  </div>
                </Button>
              </li>
              <li>
                <Button onClick={this.props.onAdd}>
                  <Octicon symbol={OcticonSymbol.fileDirectory} />
                  <div>
                    {__DARWIN__
                      ? 'Add an Existing Repository from Your Hard Drive…'
                      : 'Add an Existing Repository from your hard drive…'}
                  </div>
                </Button>
              </li>
            </ul>

            <div className="drag-drop-info">
              <Octicon symbol={OcticonSymbol.lightBulb} />
              <div>
                <strong>ProTip!</strong> You can drag &amp; drop an existing
                repository folder here to add it to Desktop
              </div>
            </div>
          </div>
        </div>

        <img className="blankslate-graphic-top" src={WelcomeLeftTopImageUri} />
        <img
          className="blankslate-graphic-bottom"
          src={WelcomeLeftBottomImageUri}
        />
      </UiView>
    )
  }
}
