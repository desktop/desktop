import * as React from 'react'

import { ImageDiff } from '../../models/diff'
import { renderImage } from './render-image'


/** The props for the Diff component. */
interface IDeletedImageDiffProps {
  /**
   * TODO
   */
  readonly previous: ImageDiff
}

/** A component which renders a diff for a file. */
export class DeletedImageDiff extends React.Component<IDeletedImageDiffProps, void> {

  public render() {
    return <div className='panel' id='diff'>
      <div className='image-header'>this image will be removed</div>
      {renderImage(this.props.previous)}
    </div>
  }
}
