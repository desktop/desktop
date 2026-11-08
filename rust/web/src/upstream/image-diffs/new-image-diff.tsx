import * as React from 'react'

import { Image } from '../diff/image'
import { ImageContainer } from './image-container'

interface INewImageDiffProps {
  readonly current: Image
}

/** A component to render when a new image has been added to the repository */
export class NewImageDiff extends React.Component<INewImageDiffProps, {}> {
  public render() {
    return (
      <div className="panel image" id="diff">
        <div className="image-diff-current">
          <div className="image-diff-header">Added</div>
          <ImageContainer label="After image" image={this.props.current} />
        </div>
      </div>
    )
  }
}
