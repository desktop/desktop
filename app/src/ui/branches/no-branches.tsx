import * as React from 'react'
import { encodePathAsUrl } from '../../lib/path'
import { Button } from '../lib/button'

const BlankSlateImage = encodePathAsUrl(
  __dirname,
  'static/empty-no-branches.svg'
)

interface INoBranchesProps {
  /** The callback to invoke when the user wishes to create a new branch */
  readonly onCreateNewBranch: () => void
  /** True to display the UI elements for creating a new branch, false to hide them */
  readonly canCreateNewBranch: boolean
}

export class NoBranches extends React.Component<INoBranchesProps> {
  public render() {
    if (this.props.canCreateNewBranch) {
      return (
        <div className="no-branches">
          <img src={BlankSlateImage} className="blankslate-image" />

          <div className="title">Sorry, I can't find that branch</div>

          <div className="subtitle">
            Do you want to create a new branch instead?
          </div>

          <Button
            className="create-branch-button"
            onClick={this.props.onCreateNewBranch}
            type="submit"
          >
            {__DARWIN__ ? 'Create New Branch' : 'Create new branch'}
          </Button>

          <div className="protip">
            ProTip! Press {this.renderShortcut()} to quickly create a new branch
            from anywhere within the app
          </div>
        </div>
      )
    }

    return <div className="no-branches">Sorry, I can't find that branch</div>
  }

  private renderShortcut() {
    if (__DARWIN__) {
      return (
        <span>
          <kbd>⌘</kbd> + <kbd>⇧</kbd> + <kbd>N</kbd>
        </span>
      )
    } else {
      return (
        <span>
          <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>N</kbd>
        </span>
      )
    }
  }
}
