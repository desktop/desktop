import * as React from 'react'

import { Image } from '../../models/diff'
import { renderImage } from './render-image'

interface IModifiedImageDiffProps {
  readonly previous: Image
  readonly current: Image
}

/** A component which renders the changes to an image in the repository */
export class ModifiedImageDiff extends React.Component<IModifiedImageDiffProps, void> {

  public render() {
    return <div className='panel image' id='diff'>
      <div className='image-header'>this image</div>
      {renderImage(this.props.previous)}
      <div className='image-header'>will be replaced with</div>
      {renderImage(this.props.current)}
    </div>
  }
}
