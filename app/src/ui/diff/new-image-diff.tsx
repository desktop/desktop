import * as React from 'react'

import { Image } from '../../models/diff'
import { renderImage } from './render-image'


interface INewImageDiffProps {
  readonly current: Image
}

/** A component to render when a new image has been added to the repository */
export class NewImageDiff extends React.Component<INewImageDiffProps, void> {

  public render() {
    return <div className='panel image' id='diff'>
      <div className='image-header'>this new image will be committed</div>
      {renderImage(this.props.current)}
    </div>
  }
}
