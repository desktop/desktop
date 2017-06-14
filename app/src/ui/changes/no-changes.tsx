import * as React from 'react'

const BlankSlateImage = `file:///${__dirname}/static/empty-no-file-selected.svg`

interface INoChangesProps {
}

/** The component to display when there are no local changes. */
export class NoChanges extends React.Component<INoChangesProps, void> {
  public render() {
    return (
      <div className='panel blankslate' id='no-changes'>
        <img src={BlankSlateImage} className='blankslate-image' />
        No local changes
      </div>
    )
  }
}
