import * as React from 'react'
import { UiView } from '../ui-view'
import { Button } from '../lib/button'
import { Octicon, OcticonSymbol } from '../octicons'

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
export class BlankSlateView extends React.Component<IBlankSlateProps, void> {
  public render() {
    return (
      <UiView id='blank-slate'>
        <div className='header'>
          <div className='title'>{__DARWIN__ ? 'No Repositories Found' : 'No repositories found'}</div>
          <div>
            Add or create a repository so that you can start committing code and publish it to GitHub.
          </div>
        </div>

        <div className='content'>
          <div className='callout'>
            <Octicon symbol={OcticonSymbol.plus}/>
            <div>Create a new project and publish it to GitHub</div>
            <Button onClick={this.props.onCreate}>
              {__DARWIN__ ? 'Create New Repository' : 'Create new repository'}
            </Button>
          </div>

          <div className='callout'>
            <Octicon symbol={OcticonSymbol.repoClone}/>
            <div>Clone an existing project from GitHub to your computer</div>
            <Button onClick={this.props.onClone}>
              {__DARWIN__ ? 'Clone a Repository' : 'Clone a repository'}
            </Button>
          </div>

          <div className='callout'>
            <Octicon symbol={OcticonSymbol.deviceDesktop}/>
            <div>Add an existing project on your computer and publish it to GitHub</div>
            <Button onClick={this.props.onAdd}>
              {__DARWIN__ ? 'Add a Local Repository' : 'Add a local repository'}
            </Button>
          </div>
        </div>

        <p className='footer'>
          Alternatively, you can drag and drop a local repository here
          to add it.
        </p>
      </UiView>
    )
  }
}
