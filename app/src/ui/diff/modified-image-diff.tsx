import * as React from 'react'

import { ImageDiff } from '../../models/diff'
import { renderImage } from './render-image'


/** The props for the Diff component. */
interface IModifiedImageDiffProps {
  /**
   * TODO
   */
  readonly previous: ImageDiff

  /**
   * TODO
   */
  readonly current: ImageDiff
}

/** A component which renders a diff for a file. */
export class ModifiedImageDiff extends React.Component<IModifiedImageDiffProps, void> {

  public render() {
    return <div className='panel' id='diff'>
      <div className='image-header'>this image</div>
      {renderImage(this.props.previous)}
      <div className='image-header'>will be replaced with</div>
      {renderImage(this.props.current)}
    </div>
  }
}
