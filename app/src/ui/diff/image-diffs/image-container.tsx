import * as React from 'react'

import { Image } from '../../../models/diff'

interface IImageProps {
  /** The image contents to render */
  readonly image: Image

  /** Optional styles to apply to the image container */
  readonly style?: React.CSSProperties

  /** callback to fire after the image has been loaded */
  readonly onElementLoad?: (img: HTMLImageElement) => void
}

export class ImageContainer extends React.Component<IImageProps, {}> {
  public render() {
    const image = this.props.image
    const imageSource = `data:${image.mediaType};base64,${image.contents}`

    return (
      <div className="image-wrapper">
        <img src={imageSource} style={this.props.style} onLoad={this.onLoad} />
      </div>
    )
  }

  private onLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    if (this.props.onElementLoad) {
      this.props.onElementLoad(e.currentTarget)
    }
  }
}
