import * as React from 'react'

import { Image } from '../diff/image'
import { ImageContainer } from './image-container'

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
        <div className="image-diff-previous">
          <div className="image-diff-header">Deleted</div>
          <ImageContainer label="Before image" image={this.props.previous} />
        </div>
      </div>
    )
  }
}
