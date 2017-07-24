import * as React from 'react'

import { Image } from '../../models/diff'
import { renderImage } from './render-image'

interface IDeletedImageDiffProps {
  readonly previous: Image
}

/** A component to render when the file has been deleted from the repository */
export class DeletedImageDiff extends React.Component<
  IDeletedImageDiffProps,
  {}
> {
  public render() {
    return (
      <div className="panel image" id="diff">
        <div className="image-diff__before">
          <div className="image-diff__header">Deleted</div>
          {renderImage(this.props.previous)}
        </div>
      </div>
    )
  }
}
