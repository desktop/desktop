import * as React from 'react'

import { Image } from '../../../models/diff'

interface IImageProps {
  readonly image: Image

  readonly style?: React.CSSProperties

  readonly onElementLoad?: (img: HTMLImageElement) => void
}

export class DiffImage extends React.Component<IImageProps, {}> {
  public render() {
    const image = this.props.image
    const imageSource = `data:${image.mediaType};base64,${image.contents}`

    return (
      <img src={imageSource} style={this.props.style} onLoad={this.onLoad} />
    )
  }

  private onLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    if (this.props.onElementLoad) {
      this.props.onElementLoad(e.currentTarget)
    }
  }
}
