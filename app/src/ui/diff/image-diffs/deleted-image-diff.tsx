import * as React from 'react'

import { Image } from '../../../models/diff'
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
          <ImageContainer image={this.props.previous} />
        </div>
      </div>
    )
  }
}
