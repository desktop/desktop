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
      <div>this image</div>
      <div>
        {renderImage(this.props.previous)}
      </div>
      <div>will be replaced with</div>
      <div>
        {renderImage(this.props.current)}
      </div>
    </div>
  }
}
