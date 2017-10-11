import * as React from 'react'
import { LinkButton } from '../lib/link-button'

const BlankSlateImage = `file:///${__dirname}/static/empty-no-file-selected.svg`

interface INoChangesProps {
  /** Called when the user chooses to open the repository. */
  readonly onOpenRepository: () => void
}

/** The component to display when there are no local changes. */
export class NoChanges extends React.Component<INoChangesProps, {}> {
  public render() {
    const opener = __DARWIN__ ? 'Finder' : 'Explorer'
    return (
      <div className="panel blankslate" id="no-changes">
        <img src={BlankSlateImage} className="blankslate-image" />
        <div>No local changes</div>

        <div>
          Would you like to{' '}
          <LinkButton onClick={this.open}>open this repository</LinkButton> in{' '}
          {opener}?
        </div>
      </div>
    )
  }

  private open = () => {
    this.props.onOpenRepository()
  }
}
