import * as React from 'react'

import { ImageDiff } from '../../models/diff'
import { renderImage } from './render-image'


/** The props for the Diff component. */
interface INewImageDiffProps {
  /**
   * TODO
   */
  readonly current: ImageDiff
}

/** A component which renders a diff for a file. */
export class NewImageDiff extends React.Component<INewImageDiffProps, void> {

  public render() {
    return <div className='panel' id='diff'>
      <div className='image-header'>this new image will be committed</div>
      {renderImage(this.props.current)}
    </div>
  }
}
