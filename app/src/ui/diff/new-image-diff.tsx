import * as React from 'react'

import { Image } from '../../models/diff'
import { renderImage } from './render-image'

interface INewImageDiffProps {
  readonly current: Image
}

/** A component to render when a new image has been added to the repository */
export class NewImageDiff extends React.Component<INewImageDiffProps, {}> {
  public render() {
    return (
      <div className="panel image" id="diff">
        <div className="image-diff__after">
          <div className="image-diff__header">Added</div>
          {renderImage(this.props.current)}
        </div>
      </div>
    )
  }
}
