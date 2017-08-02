import * as React from 'react'

import { Image } from '../../../models/diff'

interface IRenderImageOptions {
  readonly style?: {}
  readonly onLoad?: (e: React.SyntheticEvent<HTMLImageElement>) => void
}

export function renderImage(
  image: Image | undefined,
  options?: IRenderImageOptions
) {
  if (!image) {
    return null
  }

  const imageSource = `data:${image.mediaType};base64,${image.contents}`

  return <img src={imageSource} {...options} />
}
