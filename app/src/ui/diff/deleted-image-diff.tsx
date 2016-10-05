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
      <div>this image will be removed</div>
      <div>
        {renderImage(this.props.previous)}
      </div>
    </div>
  }
}
